"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { continueManualCatalogUpdate } from "@/application/ingestion/manual-catalog-update";
import { prisma } from "@/infrastructure/database/prisma";
import { manualCatalogProvider } from "@/application/ingestion/synchronization-status";
import {
  assertManualSynchronizationNotThrottled,
  getActiveSynchronization,
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
    const active = await getActiveSynchronization(manualCatalogProvider);
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

  await prisma.importRun.update({
    where: { id: run.id },
    data: { phase: "queued:0" },
  });
  after(async () => {
    await continueManualCatalogUpdate(run.id);
    revalidatePath("/");
    revalidateTag(catalogCountCacheTag, { expire: 0 });
    revalidateTag(marketAnalysisCacheTag, "max");
  });

  return { outcome: "started", runId: run.id };
}

export async function getSavedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 200));
}

export async function getComparedListings(listingIds: readonly string[]) {
  return getListingsByIds(listingIds.slice(0, 4));
}
