import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSynchronization, synchronizationHeartbeatTimeoutMs } from "./synchronization-status";

const now = Date.UTC(2026, 10, 11, 8);
const run = {
  status: "running",
  heartbeatAt: new Date(now),
  fetchedCount: 15,
  createdCount: 4,
  updatedCount: 3,
};

test("continues polling a live catalogue sweep until the sweep itself finishes", () => {
  assert.deepEqual(summarizeSynchronization(run, now), { outcome: "running", fetchedCount: 15 });
  assert.deepEqual(summarizeSynchronization({ ...run, status: "completed" }, now), {
    outcome: "completed",
    createdCount: 4,
    updatedCount: 3,
  });
  assert.equal(summarizeSynchronization({ ...run, status: "completed_with_errors" }, now).outcome, "warning");
});

test("reports failed, interrupted and abandoned runs as terminal failures", () => {
  for (const status of ["failed", "interrupted"]) {
    assert.equal(summarizeSynchronization({ ...run, status }, now).outcome, "failed");
  }
  assert.equal(summarizeSynchronization(run, now + synchronizationHeartbeatTimeoutMs + 1).outcome, "failed");
});
