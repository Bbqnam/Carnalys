"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { synchronizeAllSourcesIncrementally } from "@/application/ingestion/incremental-all-sources";
import { getCurrentUser } from "@/features/auth/session";
import { getActiveSynchronization } from "@/infrastructure/database/synchronization-state-repository";
import { marketAnalysisCacheTag } from "@/infrastructure/database/market-analysis-repository";
import {
  catalogCountCacheTag,
  getActiveListingCount,
  getListingsByIds,
} from "@/infrastructure/database/vehicle-listing-repository";

export interface ManualSynchronizationState {
  outcome:
    | "idle"
    | "started"
    | "completed"
    | "warning"
    | "busy"
    | "failed"
    | "unauthorized";
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

  // The trigger walks four sources and rebuilds analyses/facets — real work
  // that shouldn't be startable by an anonymous drive-by. A signed-in account
  // is the bar for now; tighten to an admin role when the user base grows.
  if (!(await getCurrentUser())) {
    return { outcome: "unauthorized" };
  }

  // A manual sync walks four sources and then rebuilds analyses, facets and the
  // whole-catalogue representative flags. Awaiting all of that inside the action
  // meant the button sat spinning for a minute or more and, if the function
  // timed out first, the client never got a result to refresh on — so the page
  // "stuck" until a manual reload. The work now runs *after* the response via
  // `after()`: the click returns immediately, and the button polls the sync
  // lock for progress and refreshes when it clears.
  if (await getActiveSynchronization("blocket_unofficial")) {
    return { outcome: "busy" };
  }

  after(async () => {
    try {
      await synchronizeAllSourcesIncrementally({
        maximumPagesPerSource: 4,
        lookbackHours: 3,
        knownPageThreshold: 1,
        throttle: true,
      });
    } catch (error) {
      console.error("Bakgrundssynkronisering misslyckades.", error);
    }
    // A freshly synced catalog leaves both the page's RSC cache and the
    // Analysis page's aggregates stale.
    revalidatePath("/");
    revalidateTag(marketAnalysisCacheTag, "max");
    revalidateTag(catalogCountCacheTag, "max");
  });

  return { outcome: "started" };
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
