import assert from "node:assert/strict";
import test from "node:test";
import { manualCatalogQueueState, summarizeSynchronization, synchronizationHeartbeatTimeoutMs } from "./synchronization-status";

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


test("a saved manual queue remains pending across a browser reconnection", () => {
  const later = now + synchronizationHeartbeatTimeoutMs + 60_000;
  assert.equal(summarizeSynchronization({ ...run, persistent: true }, later).outcome, "running");
  assert.equal(summarizeSynchronization({ ...run, persistent: true, status: "failed" }, later).outcome, "failed");
});

test("an existing five-source queue migrates without losing unfinished providers", () => {
  const providers = ["blocket_unofficial", "bytbil", "hedin", "autohero"];
  const state = manualCatalogQueueState("queued:0:30", 2, providers, [
    { provider: "wayke", status: "failed" },
    { provider: "bytbil", status: "running" },
    { provider: "hedin", status: "completed" },
    { provider: "autohero", status: "completed" },
  ]);
  assert.deepEqual(state, { index: 0, completedSources: 12, inheritedFailures: 0 });
});

test("the four-source queue retains progress and current warnings", () => {
  const state = manualCatalogQueueState("queued:1:1:v2", 2,
    ["blocket_unofficial", "bytbil", "hedin", "autohero"], []);
  assert.deepEqual(state, { index: 1, completedSources: 1, inheritedFailures: 2 });
});
