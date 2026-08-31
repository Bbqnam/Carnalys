import {
  existingListingDetailPayloads,
  existingListingPayloads,
} from "@/infrastructure/database/listing-write-repository";
import {
  assertManualSynchronizationNotThrottled,
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import { AutoheroImporter } from "@/infrastructure/marketplaces/autohero/importer";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";
import { BytbilImporter } from "@/infrastructure/marketplaces/bytbil/importer";
import { HedinImporter } from "@/infrastructure/marketplaces/hedin/importer";
import { WaykeImporter } from "@/infrastructure/marketplaces/wayke/importer";
import {
  refreshBatchDerivedData,
  synchronizeMarketplace,
} from "./synchronize-marketplace";
import type { MarketplaceImporter } from "./types";

export type SourceSyncOutcome = "completed" | "warning" | "busy" | "failed";

export interface AllSourcesIncrementalOptions {
  /** Restrict the run to these provider keys (in registry order). Omit for
   *  every registered source. */
  providers?: readonly string[];
  /** Per-source page ceiling. Incremental still stops early once a page is
   *  both fully known and older than the lookback window. */
  maximumPagesPerSource?: number;
  lookbackHours?: number;
  knownPageThreshold?: number;
  /** Apply the manual cooldown before each source (used by the UI button so a
   *  scripted double-click can't re-scrape back to back). */
  throttle?: boolean;
  onProgress?: (message: string) => void;
}

export interface AllSourcesIncrementalResult {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  removedCount: number;
  completedAt?: Date;
  perSource: { provider: string; outcome: SourceSyncOutcome }[];
}

/** Every registered source, in a deliberate order: the biggest marketplace
 *  first so its work is done even if a later source runs long. */
function buildImporters(providers?: readonly string[]): MarketplaceImporter[] {
  const all: MarketplaceImporter[] = [
    new BlocketUnofficialImporter(undefined, existingListingDetailPayloads),
    new WaykeImporter(undefined, existingListingPayloads),
    new BytbilImporter(undefined, existingListingPayloads),
    new HedinImporter(undefined, existingListingPayloads),
    new AutoheroImporter(undefined, existingListingPayloads),
  ];
  if (!providers) return all;
  const wanted = new Set(providers);
  return all.filter((importer) => wanted.has(importer.provider));
}

/**
 * Runs an incremental sync for each registered source, one after another,
 * then refreshes analyses / facets / representatives once for the whole sweep.
 *
 * Sources run sequentially on purpose: they share one pooled Postgres
 * connection, and Blocket alone does enough per-page DB work that running the
 * four concurrently just makes every query queue — a measured sweep went from
 * ~70s sequential to ~120s parallel. Each source takes its own per-provider
 * lock; one failing or being throttled is recorded and the rest still run.
 *
 * The catalog-wide derived data used to be rebuilt inside every source (four
 * full facet + representative rebuilds per click). It is deferred here and
 * done once, and skipped entirely when nothing was created, updated or
 * removed. Never reconciles — new and changed ads only.
 */
export async function synchronizeAllSourcesIncrementally(
  options: AllSourcesIncrementalOptions = {},
): Promise<AllSourcesIncrementalResult> {
  const {
    providers,
    maximumPagesPerSource = 4,
    lookbackHours = 6,
    knownPageThreshold = 1,
    throttle = false,
    onProgress,
  } = options;

  const result: AllSourcesIncrementalResult = {
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    failedCount: 0,
    removedCount: 0,
    perSource: [],
  };

  const changedListingIds = new Set<string>();

  for (const importer of buildImporters(providers)) {
    try {
      if (throttle) {
        await assertManualSynchronizationNotThrottled(importer.provider);
      }
      const run = await synchronizeMarketplace(importer, {
        mode: "incremental",
        incrementalLookbackHours: lookbackHours,
        incrementalKnownPageThreshold: knownPageThreshold,
        incrementalMaximumPages: maximumPagesPerSource,
        deferDerivedData: true,
        onProgress,
      });
      result.createdCount += run.createdCount;
      result.updatedCount += run.updatedCount;
      result.unchangedCount += run.unchangedCount;
      result.failedCount += run.failedCount;
      result.removedCount += run.removedCount ?? 0;
      if (run.completedAt) result.completedAt = run.completedAt;
      for (const id of run.changedListingIds) changedListingIds.add(id);
      result.perSource.push({
        provider: importer.provider,
        outcome: run.failedCount > 0 ? "warning" : "completed",
      });
    } catch (error) {
      if (error instanceof SynchronizationAlreadyRunningError) {
        result.perSource.push({ provider: importer.provider, outcome: "busy" });
        continue;
      }
      result.perSource.push({ provider: importer.provider, outcome: "failed" });
      console.error(
        `Inkrementell synkronisering misslyckades för ${importer.provider}.`,
        error,
      );
    }
  }

  const catalogChanged =
    result.createdCount + result.updatedCount + result.removedCount > 0;
  if (catalogChanged) {
    const derivedFailed = await refreshBatchDerivedData([...changedListingIds]);
    if (derivedFailed) {
      // The result has no dedicated slot for a post-sweep failure, so fold it
      // into the per-source outcomes — the caller flags a warning off these.
      for (const entry of result.perSource) {
        if (entry.outcome === "completed") entry.outcome = "warning";
      }
    }
  }

  return result;
}
