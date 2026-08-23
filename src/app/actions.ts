"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import { existingListingDetailPayloads } from "@/infrastructure/database/listing-write-repository";
import {
  assertManualSynchronizationNotThrottled,
  getActiveSynchronization,
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import { marketAnalysisCacheTag } from "@/infrastructure/database/market-analysis-repository";
import {
  getActiveListingCount,
  getListingsByIds,
} from "@/infrastructure/database/vehicle-listing-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";

export interface ManualSynchronizationState {
  outcome: "idle" | "completed" | "warning" | "busy" | "failed";
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  failedCount?: number;
  completedAt?: string;
  activeMode?: string;
}

export async function synchronizeLatestListings(
  _previousState: ManualSynchronizationState,
): Promise<ManualSynchronizationState> {
  void _previousState;

  try {
    await assertManualSynchronizationNotThrottled("blocket_unofficial");
    const result = await synchronizeMarketplace(
      new BlocketUnofficialImporter(undefined, existingListingDetailPayloads),
      {
        mode: "incremental",
        // Interactive button click: stop as soon as a page is both fully
        // known and older than the (short) lookback window, instead of the
        // cron's 72h window — otherwise every click walks the full page cap
        // even when nothing new was posted, since "oldest listing on this
        // page is over 72h old" almost never becomes true within a handful
        // of pages on an active marketplace. Detail fetches are skipped
        // entirely for already-known, already-enriched listings (reused
        // from cached data), so this only pays the network cost for
        // genuinely new listings.
        incrementalLookbackHours: 2,
        incrementalKnownPageThreshold: 1,
        incrementalMaximumPages: 4,
      },
    );
    revalidatePath("/");
    // The Analysis page's aggregates are cached for a window that outlives a
    // manual sync, so they have to be dropped explicitly or a freshly synced
    // catalog would show stale market figures.
    revalidateTag(marketAnalysisCacheTag, "max");
    return {
      outcome: result.failedCount > 0 ? "warning" : "completed",
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
      failedCount: result.failedCount,
      completedAt: result.completedAt?.toISOString(),
    };
  } catch (error) {
    if (error instanceof SynchronizationAlreadyRunningError) {
      return { outcome: "busy", activeMode: error.mode };
    }
    console.error("Manuell inkrementell synkronisering misslyckades.", error);
    return { outcome: "failed" };
  }
}

export async function getSavedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 200));
}

export async function getComparedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 4));
}

export interface SynchronizationProgress {
  mode: string;
  phase: string;
  fetchedCount: number;
  pagesProcessed: number;
  totalListings: number;
}

export async function getSynchronizationProgress(): Promise<
  SynchronizationProgress | undefined
> {
  const [active, totalListings] = await Promise.all([
    getActiveSynchronization("blocket_unofficial"),
    getActiveListingCount(),
  ]);
  if (!active) return undefined;
  return {
    mode: active.mode,
    phase: active.phase,
    fetchedCount: active.fetchedCount,
    pagesProcessed: active.pagesProcessed,
    totalListings,
  };
}
