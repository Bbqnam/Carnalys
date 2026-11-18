export const manualCatalogProvider = "manual_catalog";
export const synchronizationHeartbeatTimeoutMs = 5 * 60 * 1_000;

export type SynchronizationStatus =
  | { outcome: "running"; fetchedCount: number }
  | { outcome: "completed" | "warning"; createdCount: number; updatedCount: number; failedSources?: string[] }
  | { outcome: "failed" };

export function summarizeSynchronization(
  run: {
    status: string;
    heartbeatAt: Date | null;
    fetchedCount: number;
    createdCount: number;
    updatedCount: number;
    persistent?: boolean;
  },
  now = Date.now(),
): SynchronizationStatus {
  if (run.status === "running" && (run.persistent ||
    (run.heartbeatAt && run.heartbeatAt.getTime() >= now - synchronizationHeartbeatTimeoutMs))) {
    return { outcome: "running", fetchedCount: run.fetchedCount };
  }
  if (run.status === "completed" || run.status === "completed_with_errors") {
    return {
      outcome: run.status === "completed" ? "completed" : "warning",
      createdCount: run.createdCount,
      updatedCount: run.updatedCount,
    };
  }
  return { outcome: "failed" };
}

export function manualCatalogQueueState(
  phase: string,
  failedCount: number,
  providers: readonly string[],
  latestRuns: readonly { provider: string; status: string }[],
) {
  const parts = phase.split(":");
  if (parts[3] === "v2") {
    return {
      index: Number(parts[1] ?? 0),
      completedSources: Number(parts[2] ?? 0) & ((1 << providers.length) - 1),
      inheritedFailures: failedCount,
    };
  }

  // Legacy jobs used five positional sources. Rebuild their state using
  // successful runs from the remaining providers instead of shifting bits.
  let completedSources = 0;
  let inheritedFailures = 0;
  for (const [position, provider] of providers.entries()) {
    const child = latestRuns.find((run) => run.provider === provider);
    if (child?.status === "completed" || child?.status === "completed_with_errors") {
      completedSources |= 1 << position;
      if (child.status === "completed_with_errors") inheritedFailures++;
    }
  }
  const unfinished = providers.findIndex((_, position) => !(completedSources & (1 << position)));
  return { index: unfinished < 0 ? 0 : unfinished, completedSources, inheritedFailures };
}
