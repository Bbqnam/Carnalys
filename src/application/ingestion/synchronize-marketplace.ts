import type {
  MarketplaceImporter,
  SynchronizationMode,
} from "./types";
import { refreshCatalogFacets } from "@/infrastructure/database/catalog-facet-repository";
import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";
import {
  existingListingExternalIds,
  markMissingListingsRemovedSafely,
  refreshAllVehicleRepresentatives,
  upsertNormalizedListings,
} from "@/infrastructure/database/listing-write-repository";
import {
  advanceCheckpoint,
  checkpointPartition,
  ensureRootCheckpoint,
  failCheckpoint,
  failSynchronizationRun,
  finishSynchronizationRun,
  interruptSynchronizationRun,
  nextReconciliationCheckpoint,
  reconciliationCompletion,
  recordIncrementalProgress,
  recordRequestFailure,
  recordSynchronizationError,
  setSynchronizationPhase,
  splitCheckpoint,
  startCheckpoint,
  startSynchronizationRun,
  synchronizationRunResult,
  type SynchronizationRunHandle,
} from "@/infrastructure/database/synchronization-state-repository";

export interface SynchronizationOptions {
  mode?: SynchronizationMode;
  resumeOnly?: boolean;
  incrementalLookbackHours?: number;
  incrementalMaximumPages?: number;
  incrementalKnownPageThreshold?: number;
  analysisRefreshLimit?: number;
  onProgress?: (message: string) => void;
  shouldStop?: () => boolean;
  /**
   * Skip the post-fetch analyses/facets/representatives refresh and instead
   * return the changed listing ids so the caller can refresh once for a whole
   * batch of sources. Used by the multi-source incremental sweep, where doing
   * it per source rebuilt the catalog-wide facets and representatives four
   * times over. Incremental mode only; reconciliation always refreshes inline.
   */
  deferDerivedData?: boolean;
}

export interface IncrementalRunResult {
  changedListingIds: readonly string[];
}

class SynchronizationStopRequestedError extends Error {
  constructor() {
    super("Synkroniseringen avbröts efter senast sparade sida.");
    this.name = "SynchronizationStopRequestedError";
  }
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value && Number.isInteger(value) && value > 0 ? value : fallback;
}

function progress(options: SynchronizationOptions, message: string) {
  options.onProgress?.(message);
}

function stopIfRequested(options: SynchronizationOptions) {
  if (options.shouldStop?.()) throw new SynchronizationStopRequestedError();
}

function partitionPageListings(
  partition: Parameters<MarketplaceImporter["splitPartition"]>[0],
  listings: Awaited<ReturnType<MarketplaceImporter["fetchPage"]>>["listings"],
) {
  const inside = [] as typeof listings[number][];
  const outside = [] as typeof listings[number][];

  for (const listing of listings) {
    const mileageMil = listing.listing.mileageKm / 10;
    const isOutside =
      listing.vehicle.modelYear < partition.yearFrom ||
      listing.vehicle.modelYear > partition.yearTo ||
      listing.listing.priceAmount < partition.priceFrom ||
      (!partition.unboundedPriceTo &&
        listing.listing.priceAmount > partition.priceTo) ||
      mileageMil < partition.mileageFrom ||
      mileageMil > partition.mileageTo;
    (isOutside ? outside : inside).push(listing);
  }

  return { inside, outside };
}

function rememberChangedListings(
  rememberedIds: string[],
  newIds: readonly string[],
  limit: number,
) {
  for (const id of newIds) {
    if (rememberedIds.length >= limit) break;
    rememberedIds.push(id);
  }
}

async function refreshDerivedData(
  run: SynchronizationRunHandle,
  changedListingIds: readonly string[],
) {
  let failed = false;

  if (changedListingIds.length > 0) {
    try {
      await setSynchronizationPhase(run, "analyzing");
      await refreshStoredListingAnalyses(
        changedListingIds,
        changedListingIds.length,
      );
    } catch (error) {
      failed = true;
      await recordSynchronizationError(run, error, { phase: "analysis" });
    }
  }

  try {
    await setSynchronizationPhase(run, "refreshing_facets");
    await refreshCatalogFacets();
  } catch (error) {
    failed = true;
    await recordSynchronizationError(run, error, { phase: "facets" });
  }

  try {
    await refreshAllVehicleRepresentatives();
  } catch (error) {
    failed = true;
    await recordSynchronizationError(run, error, { phase: "representatives" });
  }

  return failed;
}

/**
 * The `deferDerivedData` counterpart of {@link refreshDerivedData}: one
 * analyses/facets/representatives pass for a whole batch of sources, with no
 * per-run bookkeeping (the runs it belongs to have already finished). Returns
 * true if any step failed; errors are logged, not thrown, so a facet-refresh
 * blip never masks a successful ingest.
 */
export async function refreshBatchDerivedData(
  changedListingIds: readonly string[],
): Promise<boolean> {
  let failed = false;

  if (changedListingIds.length > 0) {
    try {
      await refreshStoredListingAnalyses(
        changedListingIds,
        changedListingIds.length,
      );
    } catch (error) {
      failed = true;
      console.error("Batch-analys av ändrade annonser misslyckades.", error);
    }
  }

  try {
    await refreshCatalogFacets();
  } catch (error) {
    failed = true;
    console.error("Uppdatering av katalogfacetter misslyckades.", error);
  }

  try {
    await refreshAllVehicleRepresentatives();
  } catch (error) {
    failed = true;
    console.error("Uppdatering av fordonsrepresentanter misslyckades.", error);
  }

  return failed;
}

async function runIncrementalSynchronization(
  importer: MarketplaceImporter,
  run: SynchronizationRunHandle,
  options: SynchronizationOptions,
) {
  const maximumPages = positiveInteger(options.incrementalMaximumPages, 40);
  const knownPageThreshold = positiveInteger(
    options.incrementalKnownPageThreshold,
    2,
  );
  const lookbackHours = positiveInteger(options.incrementalLookbackHours, 72);
  const analysisLimit = positiveInteger(options.analysisRefreshLimit, 250);
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1_000);
  const changedListingIds: string[] = [];
  let consecutiveKnownOldPages = 0;
  let stopReason = "maximum_pages";

  await setSynchronizationPhase(run, "incremental");
  for (let pageNumber = 1; pageNumber <= maximumPages; pageNumber += 1) {
    stopIfRequested(options);
    const page = await importer.fetchPage(
      { page: pageNumber, sortOrder: "PUBLISHED_DESC" },
      (failure) =>
        recordRequestFailure(run, failure, {
          phase: "incremental_fetch",
          page: pageNumber,
        }),
    );
    const externalIds = page.listings.map(
      ({ source }) => source.externalId,
    );
    const knownIds = await existingListingExternalIds(
      importer.provider,
      externalIds,
    );
    const writeResult = await upsertNormalizedListings(
      page.listings,
      new Date(),
    );
    rememberChangedListings(
      changedListingIds,
      writeResult.changedListingIds,
      analysisLimit,
    );
    await recordIncrementalProgress(run, {
      processedCount: page.listings.length,
      rejectedCount: page.rejectedCount,
      createdCount: writeResult.createdCount,
      updatedCount: writeResult.updatedCount,
      unchangedCount: writeResult.unchangedCount,
      lastProcessedExternalId: externalIds.at(-1),
    });

    if (page.rejectedCount > 0) {
      await recordSynchronizationError(
        run,
        new Error(`${page.rejectedCount} annonser på sidan kunde inte normaliseras.`),
        { phase: "incremental_normalize", page: pageNumber },
      );
    }

    const oldestPublishedAt = page.listings.reduce<Date | undefined>(
      (oldest, listing) => {
        const publishedAt = listing.source.publishedAt;
        if (!publishedAt) return oldest;
        return !oldest || publishedAt < oldest ? publishedAt : oldest;
      },
      undefined,
    );
    const pageWasAlreadyKnown =
      externalIds.length > 0 && externalIds.every((id) => knownIds.has(id));
    const pageReachedLookback =
      oldestPublishedAt !== undefined && oldestPublishedAt <= cutoff;
    consecutiveKnownOldPages =
      pageWasAlreadyKnown && pageReachedLookback
        ? consecutiveKnownOldPages + 1
        : 0;

    progress(
      options,
      `Sida ${pageNumber}/${Math.min(page.lastPage, maximumPages)}: ${writeResult.createdCount} nya, ${writeResult.updatedCount} ändrade, ${writeResult.unchangedCount} oförändrade.`,
    );

    if (consecutiveKnownOldPages >= knownPageThreshold) {
      stopReason = "known_lookback_boundary";
      break;
    }
    if (page.currentPage >= page.lastPage) {
      stopReason = "source_exhausted";
      break;
    }
  }

  const derivedDataFailed = options.deferDerivedData
    ? false
    : await refreshDerivedData(run, changedListingIds);
  const beforeFinish = await synchronizationRunResult(run.id);
  await finishSynchronizationRun(run, {
    status:
      beforeFinish.failedCount > 0 || derivedDataFailed
        ? "completed_with_errors"
        : "completed",
    stopReason,
  });

  return { changedListingIds } satisfies IncrementalRunResult;
}

async function runReconciliation(
  importer: MarketplaceImporter,
  run: SynchronizationRunHandle,
  options: SynchronizationOptions,
) {
  const analysisLimit = positiveInteger(options.analysisRefreshLimit, 250);
  const changedListingIds: string[] = [];
  let activeCheckpoint:
    | Awaited<ReturnType<typeof nextReconciliationCheckpoint>>
    | undefined;

  try {
    await setSynchronizationPhase(run, run.resumed ? "resuming" : "discovering");
    if (!run.resumed) {
      const maximumPrice = await importer.discoverCurrentMaximumPrice((failure) =>
        recordRequestFailure(run, failure, { phase: "price_discovery", page: 1 }),
      );
      await ensureRootCheckpoint(
        run,
        importer.initialReconciliationPartition(maximumPrice),
      );
    }

    while ((activeCheckpoint = await nextReconciliationCheckpoint(run.id))) {
      stopIfRequested(options);
      await startCheckpoint(run, activeCheckpoint.id);
      const partition = checkpointPartition(activeCheckpoint);
      const page = await importer.fetchPage(
        {
          partition,
          page: activeCheckpoint.nextPage,
          sortOrder: "PUBLISHED_DESC",
        },
        (failure) =>
          recordRequestFailure(run, failure, {
            phase: "reconciliation_fetch",
            checkpointId: activeCheckpoint?.id,
            page: activeCheckpoint?.nextPage,
          }),
      );
      const partitionedListings = partitionPageListings(
        partition,
        page.listings,
      );

      if (page.totalMatches > importer.maximumResultsPerPartition) {
        const partitions = importer.splitPartition(partition);
        await splitCheckpoint(run, activeCheckpoint, partitions);
        progress(
          options,
          `Delade överfull partition ${activeCheckpoint.sequence} (${page.totalMatches.toLocaleString("sv-SE")} träffar).`,
        );
        activeCheckpoint = undefined;
        continue;
      }

      const writeResult = await upsertNormalizedListings(
        partitionedListings.inside,
        new Date(),
      );
      rememberChangedListings(
        changedListingIds,
        writeResult.changedListingIds,
        analysisLimit,
      );
      await advanceCheckpoint(
        run,
        activeCheckpoint.id,
        page,
        {
          processedCount: page.listings.length,
          rejectedCount: page.rejectedCount + partitionedListings.outside.length,
          createdCount: writeResult.createdCount,
          updatedCount: writeResult.updatedCount,
          unchangedCount: writeResult.unchangedCount,
          lastProcessedExternalId: page.listings.at(-1)?.source.externalId,
        },
      );
      if (page.rejectedCount > 0) {
        await recordSynchronizationError(
          run,
          new Error(`${page.rejectedCount} annonser på sidan kunde inte normaliseras.`),
          {
            phase: "reconciliation_normalize",
            checkpointId: activeCheckpoint.id,
            page: page.currentPage,
          },
        );
      }
      if (partitionedListings.outside.length > 0) {
        const externalIds = partitionedListings.outside
          .slice(0, 5)
          .map((listing) => listing.source.externalId)
          .join(", ");
        await recordSynchronizationError(
          run,
          new Error(
            `${partitionedListings.outside.length} annonser låg utanför den begärda sökpartitionen och hoppades över (${externalIds}).`,
          ),
          {
            phase: "reconciliation_partition_mismatch",
            checkpointId: activeCheckpoint.id,
            page: page.currentPage,
          },
        );
      }
      progress(
        options,
        `Partition ${activeCheckpoint.sequence}, sida ${page.currentPage}/${page.lastPage}: ${writeResult.createdCount} nya, ${writeResult.updatedCount} ändrade, ${writeResult.unchangedCount} oförändrade.`,
      );
      activeCheckpoint = undefined;
    }

    const completion = await reconciliationCompletion(run.id);
    let removedCount = completion.removedCount;
    if (completion.cleanupEligible && !completion.cleanupAppliedAt) {
      await setSynchronizationPhase(run, "reconciling_removals");
      removedCount = await markMissingListingsRemovedSafely(
        importer.provider,
        importer.scope,
        run.id,
        run.startedAt,
      );
    }
    const derivedDataFailed = await refreshDerivedData(run, changedListingIds);
    await finishSynchronizationRun(run, {
      status:
        completion.failedCount > 0 ||
        completion.unfinishedCheckpointCount > 0 ||
        derivedDataFailed
          ? "completed_with_errors"
          : "completed",
      removedCount,
      stopReason: completion.cleanupEligible
        ? "full_traversal_verified"
        : "full_traversal_cleanup_withheld",
    });
  } catch (error) {
    if (activeCheckpoint) {
      await failCheckpoint(run, activeCheckpoint.id, error);
    }
    throw error;
  }
}

export async function synchronizeMarketplace(
  importer: MarketplaceImporter,
  options: SynchronizationOptions = {},
) {
  const mode = options.mode ?? "incremental";
  const run = await startSynchronizationRun({
    provider: importer.provider,
    sourceScope: importer.scope,
    mode,
    resumeOnly: options.resumeOnly,
  });

  try {
    let incrementalRun: IncrementalRunResult | undefined;
    if (mode === "reconciliation") {
      await runReconciliation(importer, run, options);
    } else {
      incrementalRun = await runIncrementalSynchronization(importer, run, options);
    }
    const result = await synchronizationRunResult(run.id);
    return {
      ...result,
      changedListingIds: incrementalRun?.changedListingIds ?? [],
    };
  } catch (error) {
    if (error instanceof SynchronizationStopRequestedError) {
      await interruptSynchronizationRun(run, error.message);
      throw error;
    }
    await recordSynchronizationError(run, error, { phase: "fatal" }).catch(
      () => undefined,
    );
    await failSynchronizationRun(run, error).catch(() => undefined);
    throw error;
  }
}
