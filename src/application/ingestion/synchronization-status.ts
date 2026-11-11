export const manualCatalogProvider = "manual_catalog";
export const synchronizationHeartbeatTimeoutMs = 5 * 60 * 1_000;

export type SynchronizationStatus =
  | { outcome: "running"; fetchedCount: number }
  | { outcome: "completed" | "warning"; createdCount: number; updatedCount: number }
  | { outcome: "failed" };

export function summarizeSynchronization(
  run: {
    status: string;
    heartbeatAt: Date | null;
    fetchedCount: number;
    createdCount: number;
    updatedCount: number;
  },
  now = Date.now(),
): SynchronizationStatus {
  if (run.status === "running" && run.heartbeatAt &&
    run.heartbeatAt.getTime() >= now - synchronizationHeartbeatTimeoutMs) {
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
