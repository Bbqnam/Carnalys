import { randomUUID } from "node:crypto";
import type {
  MarketplaceRequestFailure,
  SynchronizationMode,
  VehicleSearchPartition,
} from "@/application/ingestion/types";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

const staleHeartbeatMilliseconds = 5 * 60 * 1_000;
const manualSynchronizationCooldownMilliseconds = 30 * 1_000;

export class SynchronizationAlreadyRunningError extends Error {
  constructor(
    readonly provider: string,
    readonly mode: string,
    readonly heartbeatAt: Date,
  ) {
    super(
      `En ${mode}-synkronisering för ${provider} körs redan (heartbeat ${heartbeatAt.toISOString()}).`,
    );
    this.name = "SynchronizationAlreadyRunningError";
  }
}

export class NoResumableSynchronizationError extends Error {
  constructor(provider: string, scope: string) {
    super(`Ingen avbruten full synkronisering finns för ${provider}/${scope}.`);
    this.name = "NoResumableSynchronizationError";
  }
}

export interface SynchronizationRunHandle {
  id: string;
  provider: string;
  sourceScope: string;
  mode: SynchronizationMode;
  startedAt: Date;
  resumed: boolean;
  cleanupEligible: boolean;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1_000) : "Okänt synkroniseringsfel";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function releaseStaleOrAssertAvailable(
  transaction: Prisma.TransactionClient,
  provider: string,
  now: Date,
) {
  const staleBefore = new Date(now.getTime() - staleHeartbeatMilliseconds);
  const lock = await transaction.synchronizationLock.findUnique({
    where: { provider },
  });

  if (lock && lock.heartbeatAt >= staleBefore) {
    throw new SynchronizationAlreadyRunningError(
      provider,
      lock.mode,
      lock.heartbeatAt,
    );
  }

  if (lock) {
    await transaction.importRun.updateMany({
      where: { id: lock.runId, status: "running" },
      data: {
        status: "interrupted",
        phase: "interrupted",
        completedAt: now,
        stopReason: "stale_heartbeat",
        errorMessage: "Synkroniseringen saknade en aktuell heartbeat och återställdes.",
      },
    });
    await transaction.synchronizationLock.delete({ where: { provider } });
  }

  const unlockedRunningRuns = await transaction.importRun.findMany({
    where: { provider, status: "running" },
    orderBy: { startedAt: "desc" },
  });
  for (const unlockedRunningRun of unlockedRunningRuns) {
    if (
      unlockedRunningRun.heartbeatAt &&
      unlockedRunningRun.heartbeatAt >= staleBefore
    ) {
      throw new SynchronizationAlreadyRunningError(
        provider,
        unlockedRunningRun.mode,
        unlockedRunningRun.heartbeatAt,
      );
    }
  }
  if (unlockedRunningRuns.length > 0) {
    await transaction.importRun.updateMany({
      where: {
        id: { in: unlockedRunningRuns.map(({ id }) => id) },
        status: "running",
      },
      data: {
        status: "interrupted",
        phase: "interrupted",
        completedAt: now,
        stopReason: "stale_heartbeat",
        errorMessage: "Synkroniseringen saknade ett aktivt lås och återställdes.",
      },
    });
  }
}

// The manual "Update listings" server action has no auth boundary (unlike
// /api/sync, which requires CRON_SECRET) since it's meant to be triggered by
// any visitor clicking the button. The synchronization lock only blocks
// *concurrent* runs and is released the instant a run finishes, so without
// this a scripted caller could re-trigger a real Blocket scrape back-to-back
// indefinitely. This adds a short cooldown independent of the lock.
export async function assertManualSynchronizationNotThrottled(provider: string) {
  await initializeDatabase();
  const recent = await prisma.importRun.findFirst({
    where: { provider },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true, mode: true },
  });
  if (
    recent &&
    recent.startedAt.getTime() >
      Date.now() - manualSynchronizationCooldownMilliseconds
  ) {
    throw new SynchronizationAlreadyRunningError(
      provider,
      recent.mode,
      recent.startedAt,
    );
  }
}

export async function startSynchronizationRun({
  provider,
  sourceScope,
  mode,
  resumeOnly = false,
}: {
  provider: string;
  sourceScope: string;
  mode: SynchronizationMode;
  resumeOnly?: boolean;
}): Promise<SynchronizationRunHandle> {
  await initializeDatabase();
  const now = new Date();

  const attempt = () => prisma.$transaction(async (transaction) => {
    await releaseStaleOrAssertAvailable(transaction, provider, now);

    const resumable =
      mode === "reconciliation"
        ? await transaction.importRun.findFirst({
            where: {
              provider,
              sourceScope,
              mode,
              status: { in: ["interrupted", "failed"] },
              checkpoints: { some: {} },
            },
            orderBy: { startedAt: "desc" },
          })
        : null;

    if (resumeOnly && !resumable) {
      throw new NoResumableSynchronizationError(provider, sourceScope);
    }

    const run = resumable
      ? await transaction.importRun.update({
          where: { id: resumable.id },
          data: {
            status: "running",
            phase: "resuming",
            completedAt: null,
            heartbeatAt: now,
            resumedCount: { increment: 1 },
            stopReason: null,
            errorMessage: null,
          },
        })
      : await transaction.importRun.create({
          data: {
            id: randomUUID(),
            provider,
            sourceScope,
            mode,
            phase: "starting",
            status: "running",
            startedAt: now,
            heartbeatAt: now,
            cleanupEligible: mode === "reconciliation",
          },
        });

    await transaction.synchronizationLock.create({
      data: {
        provider,
        runId: run.id,
        mode,
        acquiredAt: now,
        heartbeatAt: now,
      },
    });

    return {
      id: run.id,
      provider,
      sourceScope,
      mode,
      startedAt: run.startedAt,
      resumed: Boolean(resumable),
      cleanupEligible: run.cleanupEligible,
    };
  });

  try {
    return await attempt();
  } catch (error) {
    // Check-then-create isn't atomic under Read Committed: two near-
    // simultaneous callers can both pass releaseStaleOrAssertAvailable's
    // "no active lock" check, and the loser's synchronizationLock.create
    // collides on the provider's unique constraint instead of hitting the
    // normal SynchronizationAlreadyRunningError path.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new SynchronizationAlreadyRunningError(provider, mode, now);
    }
    throw error;
  }
}

async function assertAndRefreshLock(
  transaction: Prisma.TransactionClient,
  run: SynchronizationRunHandle,
  now: Date,
) {
  const lock = await transaction.synchronizationLock.updateMany({
    where: { provider: run.provider, runId: run.id },
    data: { heartbeatAt: now },
  });
  if (lock.count !== 1) {
    throw new Error(`Synkroniseringslåset för körning ${run.id} har förlorats.`);
  }
}

export async function setSynchronizationPhase(
  run: SynchronizationRunHandle,
  phase: string,
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importRun.update({
      where: { id: run.id },
      data: { phase, heartbeatAt: now },
    });
  });
}

export async function recordRequestFailure(
  run: SynchronizationRunHandle,
  failure: MarketplaceRequestFailure,
  context: { phase: string; checkpointId?: string; page?: number },
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importRunError.create({
      data: {
        id: randomUUID(),
        runId: run.id,
        checkpointId: context.checkpointId,
        phase: context.phase,
        page: context.page,
        attempt: failure.attempt,
        httpStatus: failure.httpStatus,
        message: errorMessage(failure.error),
        requestParameters: jsonValue(failure.requestParameters),
      },
    });
    await transaction.importRun.update({
      where: { id: run.id },
      data: { heartbeatAt: now },
    });
  });
}

export async function recordSynchronizationError(
  run: SynchronizationRunHandle,
  error: unknown,
  context: {
    phase: string;
    checkpointId?: string;
    page?: number;
    requestParameters?: unknown;
  },
) {
  await prisma.importRunError.create({
    data: {
      id: randomUUID(),
      runId: run.id,
      checkpointId: context.checkpointId,
      phase: context.phase,
      page: context.page,
      message: errorMessage(error),
      requestParameters:
        context.requestParameters === undefined
          ? undefined
          : jsonValue(context.requestParameters),
    },
  });
}

export async function ensureRootCheckpoint(
  run: SynchronizationRunHandle,
  partition: VehicleSearchPartition,
) {
  const existing = await prisma.importCheckpoint.findFirst({
    where: { runId: run.id },
    orderBy: { sequence: "asc" },
  });
  if (existing) return existing;

  return prisma.importCheckpoint.create({
    data: {
      id: randomUUID(),
      runId: run.id,
      sequence: "0000",
      ...partition,
      unboundedPriceTo: partition.unboundedPriceTo ?? false,
    },
  });
}

export function checkpointPartition(checkpoint: {
  yearFrom: number;
  yearTo: number;
  priceFrom: number;
  priceTo: number;
  unboundedPriceTo: boolean;
  mileageFrom: number;
  mileageTo: number;
}): VehicleSearchPartition {
  return {
    yearFrom: checkpoint.yearFrom,
    yearTo: checkpoint.yearTo,
    priceFrom: checkpoint.priceFrom,
    priceTo: checkpoint.priceTo,
    unboundedPriceTo: checkpoint.unboundedPriceTo,
    mileageFrom: checkpoint.mileageFrom,
    mileageTo: checkpoint.mileageTo,
  };
}

export function nextReconciliationCheckpoint(runId: string) {
  return prisma.importCheckpoint.findFirst({
    where: {
      runId,
      status: { in: ["pending", "running", "failed"] },
    },
    orderBy: { sequence: "asc" },
  });
}

export async function startCheckpoint(run: SynchronizationRunHandle, checkpointId: string) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importCheckpoint.update({
      where: { id: checkpointId },
      data: {
        status: "running",
        startedAt: now,
        heartbeatAt: now,
        lastError: null,
      },
    });
    await transaction.importRun.update({
      where: { id: run.id },
      data: { phase: "reconciling", heartbeatAt: now },
    });
  });
}

export async function splitCheckpoint(
  run: SynchronizationRunHandle,
  checkpoint: { id: string; sequence: string },
  partitions: readonly VehicleSearchPartition[],
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importCheckpoint.update({
      where: { id: checkpoint.id },
      data: { status: "split", completedAt: now, heartbeatAt: now },
    });
    await transaction.importCheckpoint.createMany({
      data: partitions.map((partition, index) => ({
        id: randomUUID(),
        runId: run.id,
        sequence: `${checkpoint.sequence}.${index.toString().padStart(2, "0")}`,
        ...partition,
        unboundedPriceTo: partition.unboundedPriceTo ?? false,
      })),
    });
    await transaction.importRun.update({
      where: { id: run.id },
      data: { heartbeatAt: now },
    });
  });
}

export interface ChunkWriteProgress {
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  rejectedCount: number;
  lastProcessedExternalId?: string;
}

export async function advanceCheckpoint(
  run: SynchronizationRunHandle,
  checkpointId: string,
  page: { currentPage: number; lastPage: number; totalMatches: number },
  progress: ChunkWriteProgress,
) {
  const now = new Date();
  const completed = page.currentPage >= page.lastPage;
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importCheckpoint.update({
      where: { id: checkpointId },
      data: {
        status: completed ? "completed" : "running",
        nextPage: page.currentPage + 1,
        lastPage: page.lastPage,
        totalMatches: page.totalMatches,
        processedCount: { increment: progress.processedCount },
        createdCount: { increment: progress.createdCount },
        updatedCount: { increment: progress.updatedCount },
        unchangedCount: { increment: progress.unchangedCount },
        rejectedCount: { increment: progress.rejectedCount },
        lastProcessedExternalId: progress.lastProcessedExternalId,
        heartbeatAt: now,
        completedAt: completed ? now : undefined,
      },
    });
    await transaction.importRun.update({
      where: { id: run.id },
      data: {
        heartbeatAt: now,
        pagesProcessed: { increment: 1 },
        partitionsProcessed: { increment: completed ? 1 : 0 },
        fetchedCount: { increment: progress.processedCount },
        importedCount: { increment: progress.processedCount },
        createdCount: { increment: progress.createdCount },
        updatedCount: { increment: progress.updatedCount },
        unchangedCount: { increment: progress.unchangedCount },
        failedCount: { increment: progress.rejectedCount },
        cleanupEligible: progress.rejectedCount > 0 ? false : undefined,
      },
    });
  });
}

export async function recordIncrementalProgress(
  run: SynchronizationRunHandle,
  progress: ChunkWriteProgress,
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importRun.update({
      where: { id: run.id },
      data: {
        phase: "incremental",
        heartbeatAt: now,
        pagesProcessed: { increment: 1 },
        fetchedCount: { increment: progress.processedCount },
        importedCount: { increment: progress.processedCount },
        createdCount: { increment: progress.createdCount },
        updatedCount: { increment: progress.updatedCount },
        unchangedCount: { increment: progress.unchangedCount },
        failedCount: { increment: progress.rejectedCount },
      },
    });
  });
}

export async function failCheckpoint(
  run: SynchronizationRunHandle,
  checkpointId: string,
  error: unknown,
) {
  const now = new Date();
  await prisma.importCheckpoint.update({
    where: { id: checkpointId },
    data: {
      status: "failed",
      heartbeatAt: now,
      errorCount: { increment: 1 },
      lastError: errorMessage(error),
    },
  });
}

export async function reconciliationCompletion(runId: string) {
  const [run, unfinishedCheckpointCount] = await Promise.all([
    prisma.importRun.findUniqueOrThrow({ where: { id: runId } }),
    prisma.importCheckpoint.count({
      where: {
        runId,
        status: { notIn: ["completed", "split"] },
      },
    }),
  ]);

  return {
    cleanupEligible:
      run.cleanupEligible &&
      unfinishedCheckpointCount === 0 &&
      run.fetchedCount > 0,
    failedCount: run.failedCount,
    fetchedCount: run.fetchedCount,
    cleanupAppliedAt: run.cleanupAppliedAt,
    removedCount: run.removedCount,
    unfinishedCheckpointCount,
  };
}

export async function finishSynchronizationRun(
  run: SynchronizationRunHandle,
  result: {
    status: "completed" | "completed_with_errors";
    removedCount?: number;
    stopReason: string;
  },
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await assertAndRefreshLock(transaction, run, now);
    await transaction.importRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        phase: "completed",
        heartbeatAt: now,
        completedAt: now,
        removedCount: result.removedCount ?? 0,
        stopReason: result.stopReason,
      },
    });
    await transaction.synchronizationLock.delete({
      where: { provider: run.provider },
    });
  });
}

export async function failSynchronizationRun(
  run: SynchronizationRunHandle,
  error: unknown,
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.importRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        phase: "failed",
        heartbeatAt: now,
        completedAt: now,
        stopReason: "error",
        errorMessage: errorMessage(error),
      },
    });
    await transaction.synchronizationLock.deleteMany({
      where: { provider: run.provider, runId: run.id },
    });
  });
}

export async function interruptSynchronizationRun(
  run: SynchronizationRunHandle,
  reason: string,
) {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.importRun.update({
      where: { id: run.id },
      data: {
        status: "interrupted",
        phase: "interrupted",
        heartbeatAt: now,
        completedAt: now,
        stopReason: "stop_requested",
        errorMessage: reason,
      },
    });
    await transaction.synchronizationLock.deleteMany({
      where: { provider: run.provider, runId: run.id },
    });
  });
}

export async function synchronizationRunResult(runId: string) {
  return prisma.importRun.findUniqueOrThrow({ where: { id: runId } });
}

export async function getActiveSynchronization(provider: string) {
  await initializeDatabase();
  const lock = await prisma.synchronizationLock.findUnique({
    where: { provider },
    include: {
      run: {
        select: {
          phase: true,
          fetchedCount: true,
          pagesProcessed: true,
        },
      },
    },
  });
  if (
    !lock ||
    lock.heartbeatAt <
      new Date(Date.now() - staleHeartbeatMilliseconds)
  ) {
    return undefined;
  }

  return {
    mode: lock.mode,
    phase: lock.run.phase,
    fetchedCount: lock.run.fetchedCount,
    pagesProcessed: lock.run.pagesProcessed,
    heartbeatAt: lock.heartbeatAt.toISOString(),
  };
}
