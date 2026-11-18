import assert from "node:assert/strict";
import test from "node:test";
import { pageCoversPreviousUpdate } from "./incremental-coverage";
import type { NormalizedVehicleListing } from "./types";

const cutoff = new Date("2026-11-17T10:00:00Z");
function listings(dates: (string | undefined)[]) {
  return dates.map((publishedAt, index) => ({
    source: { externalId: String(index), publishedAt: publishedAt ? new Date(publishedAt) : undefined },
  })) as NormalizedVehicleListing[];
}

test("recovery stops at an older dated page even when all ads were newly imported", () => {
  assert.equal(pageCoversPreviousUpdate(listings(["2026-11-17T09:00Z"]), 0, new Set(), cutoff), true);
});

test("an older pinned ad cannot hide more recent ads on the same page", () => {
  assert.equal(pageCoversPreviousUpdate(listings(["2026-11-17T09:00Z", "2026-11-17T11:00Z"]), 0, new Set(["0", "1"]), cutoff), false);
});

test("undated ads require previous coverage and rejected or empty pages cannot prove completion", () => {
  assert.equal(pageCoversPreviousUpdate(listings([undefined]), 0, new Set(), cutoff), false);
  assert.equal(pageCoversPreviousUpdate(listings([undefined]), 0, new Set(["0"]), cutoff), true);
  assert.equal(pageCoversPreviousUpdate(listings(["2026-11-17T09:00Z"]), 1, new Set(), cutoff), false);
  assert.equal(pageCoversPreviousUpdate([], 0, new Set(), cutoff), false);
});

test("a calendar label proves coverage only after its entire possible date range", () => {
  const page = listings([undefined]);
  page[0].source.publishedBefore = new Date("2026-11-17T22:59:59.999Z");
  assert.equal(pageCoversPreviousUpdate(page, 0, new Set(), cutoff), false);
  assert.equal(pageCoversPreviousUpdate(page, 0, new Set(), new Date("2026-11-18T00:00Z")), true);
});
