"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { synchronizeAllSourcesIncrementally } from "@/application/ingestion/incremental-all-sources";
import { getActiveSynchronization } from "@/infrastructure/database/synchronization-state-repository";
import { marketAnalysisCacheTag } from "@/infrastructure/database/market-analysis-repository";
import {
  getActiveListingCount,
  getListingsByIds,
} from "@/infrastructure/database/vehicle-listing-repository";

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

  // One click refreshes the newest ads from *every* registered source, not
  // just Blocket — otherwise the other sources only ever moved on the local
  // CLI and their listings looked frozen in the results. Each source is
  // incremental and stops as soon as it reaches a page that is both fully
  // known and older than the short lookback window, so a quiet source costs
  // roughly one page; detail fetches are skipped for already-enriched ads.
  const result = await synchronizeAllSourcesIncrementally({
    maximumPagesPerSource: 4,
    lookbackHours: 3,
    knownPageThreshold: 1,
    throttle: true,
  });

  revalidatePath("/");
  // The Analysis page's aggregates are cached for a window that outlives a
  // manual sync, so they have to be dropped explicitly or a freshly synced
  // catalog would show stale market figures.
  revalidateTag(marketAnalysisCacheTag, "max");

  const ranSomewhere = result.perSource.some(
    (source) => source.outcome === "completed" || source.outcome === "warning",
  );
  if (!ranSomewhere) {
    const allBusy = result.perSource.every((source) => source.outcome === "busy");
    return allBusy ? { outcome: "busy" } : { outcome: "failed" };
  }

  const anyFailure = result.perSource.some(
    (source) => source.outcome === "warning" || source.outcome === "failed",
  );
  return {
    outcome: anyFailure ? "warning" : "completed",
    createdCount: result.createdCount,
    updatedCount: result.updatedCount,
    unchangedCount: result.unchangedCount,
    failedCount: result.failedCount,
    completedAt: result.completedAt?.toISOString(),
  };
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
