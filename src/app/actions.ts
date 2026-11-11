"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { synchronizeAllSourcesIncrementally } from "@/application/ingestion/incremental-all-sources";
import { manualCatalogProvider } from "@/application/ingestion/synchronization-status";
import {
  assertManualSynchronizationNotThrottled,
  failSynchronizationRun,
  finishSynchronizationRun,
  getActiveSynchronization,
  recordIncrementalProgress,
  startSynchronizationRun,
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import { marketAnalysisCacheTag } from "@/infrastructure/database/market-analysis-repository";
import {
  catalogCountCacheTag,
  getListingsByIds,
} from "@/infrastructure/database/vehicle-listing-repository";

export interface ManualSynchronizationState {
  outcome: "idle" | "started" | "busy" | "failed";
  runId?: string;
}

export async function synchronizeLatestListings(): Promise<ManualSynchronizationState> {
  let run: Awaited<ReturnType<typeof startSynchronizationRun>>;
  try {
    const active = await getActiveSynchronization(manualCatalogProvider) ??
      await getActiveSynchronization("blocket_unofficial");
    if (active) return { outcome: "busy", runId: active.runId };

    await assertManualSynchronizationNotThrottled(manualCatalogProvider);
    run = await startSynchronizationRun({
      provider: manualCatalogProvider,
      sourceScope: "all-sources",
      mode: "incremental",
    });
  } catch (error) {
    if (error instanceof SynchronizationAlreadyRunningError) {
      const active = await getActiveSynchronization(manualCatalogProvider);
      return { outcome: "busy", runId: active?.runId };
    }
    console.error("Kunde inte starta kataloguppdateringen.", error);
    return { outcome: "failed" };
  }

  after(async () => {
    try {
      const result = await synchronizeAllSourcesIncrementally({
        maximumPagesPerSource: 4,
        lookbackHours: 3,
        knownPageThreshold: 1,
        throttle: true,
      });
      // The catalogue uses unstable_cache. Expire its data immediately so
      // the refresh after completion cannot read a stale catalogue entry.
      revalidatePath("/");
      revalidateTag(catalogCountCacheTag, { expire: 0 });
      revalidateTag(marketAnalysisCacheTag, "max");

      if (result.perSource.every(({ outcome }) => outcome === "failed" || outcome === "busy")) {
        throw new Error("Ingen källa kunde uppdateras.");
      }
      await recordIncrementalProgress(run, {
        processedCount: result.createdCount + result.updatedCount + result.unchangedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        rejectedCount: result.failedCount,
      });
      await finishSynchronizationRun(run, {
        status: result.perSource.some(({ outcome }) => outcome !== "completed")
          ? "completed_with_errors"
          : "completed",
        stopReason: "catalog_update_finished",
      });
    } catch (error) {
      console.error("Bakgrundssynkronisering misslyckades.", error);
      await failSynchronizationRun(run, error);
    }
  });

  return { outcome: "started", runId: run.id };
}

export async function getSavedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 200));
}

export async function getComparedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 4));
}
