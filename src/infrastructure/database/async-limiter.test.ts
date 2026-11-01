import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncLimiter } from "./async-limiter";

test("queued analyses respect the process budget and failures release a slot", async () => {
  const limited = createAsyncLimiter(2);
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  const tasks = Array.from({ length: 12 }, (_, id) => limited(async () => {
    active++; peak = Math.max(peak, active); started.push(id);
    try { await new Promise(resolve => setImmediate(resolve)); if (id === 1) throw new Error("Expected failure"); return id; }
    finally { active--; }
  }));
  const results = await Promise.allSettled(tasks);
  assert.equal(peak, 2);
  assert.deepEqual(started, Array.from({ length: 12 }, (_, id) => id));
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(await limited(async () => 42), 42);
});
