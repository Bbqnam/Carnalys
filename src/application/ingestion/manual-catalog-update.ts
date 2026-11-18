import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";
import { prisma } from "@/infrastructure/database/prisma";
import { existingListingDetailPayloads, existingListingPayloads } from "@/infrastructure/database/listing-write-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";
import { BytbilImporter } from "@/infrastructure/marketplaces/bytbil/importer";
import { HedinImporter } from "@/infrastructure/marketplaces/hedin/importer";
import { AutoheroImporter } from "@/infrastructure/marketplaces/autohero/importer";
import { SynchronizationAlreadyRunningError } from "@/infrastructure/database/synchronization-state-repository";
import { refreshBatchDerivedData, synchronizeMarketplace } from "./synchronize-marketplace";
import { manualCatalogProvider, manualCatalogQueueState } from "./synchronization-status";

// Each invocation saves one source page. Polling continues the persisted queue.
export async function continueManualCatalogUpdate(runId: string) {
  const parent = await prisma.importRun.findFirst({
    where: { id: runId, provider: manualCatalogProvider, status: "running" },
  });
  if (!parent) return;
  const importers = [
    new BlocketUnofficialImporter(undefined, existingListingDetailPayloads),
    new BytbilImporter(undefined, existingListingPayloads),
    new HedinImporter(undefined, existingListingPayloads),
    new AutoheroImporter(undefined, existingListingPayloads),
  ];
  const providers = importers.map((importer) => importer.provider);
  const legacyQueue = parent.phase.split(":")[3] !== "v2";
  const latest = legacyQueue
    ? await prisma.importRun.findMany({
        where: { provider: { in: providers }, startedAt: { gte: parent.startedAt } },
        orderBy: { startedAt: "desc" },
        distinct: ["provider"],
        select: { provider: true, status: true },
      })
    : [];
  const queue = manualCatalogQueueState(parent.phase, parent.failedCount, providers, latest);
  const { index, inheritedFailures } = queue;
  let completedSources = queue.completedSources;
  const workingPhase = `working:${index}:${completedSources}:v2`;
  const now = new Date();
  const claimed = await prisma.importRun.updateMany({
    where: {
      id: runId, status: "running", phase: parent.phase,
      OR: [
        { phase: { startsWith: "queued:" } },
        { heartbeatAt: { lt: new Date(now.getTime() - 180_000) } },
      ],
    },
    data: { phase: workingPhase, heartbeatAt: now },
  });
  if (!claimed.count) return;

  let sourceFinished = false;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  try {
    const result = await synchronizeMarketplace(importers[index], {
      mode: "incremental",
      incrementalCatchUp: true,
      incrementalSinglePage: true,
      incrementalLookbackHours: 30,
      analysisRefreshLimit: 250,
      deferDerivedData: true,
    });
    try {
      await refreshStoredListingAnalyses(result.changedListingIds, 250);
    } catch (error) {
      failedCount++;
      console.error("Catalogue analysis refresh failed", error);
    }
    if (result.status !== "interrupted") {
      // A resumed older job must be followed by a fresh head scan for this click.
      sourceFinished = result.startedAt >= parent.startedAt;
      createdCount = result.createdCount;
      updatedCount = result.updatedCount;
      failedCount += result.status === "completed" ? 0 : 1;
    }
  } catch (error) {
    if (!(error instanceof SynchronizationAlreadyRunningError)) {
      sourceFinished = true;
      failedCount = 1;
      console.error(`Catalogue source ${importers[index].provider} failed`, error);
    }
  }

  if (sourceFinished) completedSources |= 1 << index;
  const finished = completedSources === (1 << importers.length) - 1;
  let nextIndex = (index + 1) % importers.length;
  while (!finished && (completedSources & (1 << nextIndex))) {
    nextIndex = (nextIndex + 1) % importers.length;
  }
  if (finished && await refreshBatchDerivedData([])) failedCount++;
  await prisma.$transaction(async (transaction) => {
    const updated = await transaction.importRun.updateMany({
      where: { id: runId, phase: workingPhase, heartbeatAt: now },
      data: {
        phase: finished ? "completed" : `queued:${nextIndex}:${completedSources}:v2`,
        heartbeatAt: new Date(),
        createdCount: { increment: createdCount },
        updatedCount: { increment: updatedCount },
        failedCount: legacyQueue ? inheritedFailures + failedCount : { increment: failedCount },
        status: finished
          ? inheritedFailures + failedCount > 0 ? "completed_with_errors" : "completed"
          : "running",
        completedAt: finished ? new Date() : undefined,
        stopReason: finished ? "catalog_update_finished" : undefined,
      },
    });
    // A later invocation can reclaim a timed out lease. Its state takes priority.
    if (!updated.count) return;
    if (finished) {
      await transaction.synchronizationLock.deleteMany({
        where: { provider: manualCatalogProvider, runId },
      });
    } else {
      await transaction.synchronizationLock.updateMany({
        where: { provider: manualCatalogProvider, runId },
        data: { heartbeatAt: new Date() },
      });
    }
  });
}
