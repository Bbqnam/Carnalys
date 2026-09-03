import assert from "node:assert/strict";
import test from "node:test";
import {
  marketCohortCandidates,
  mileageBucketForKm,
  previousCompletedUtcDate,
} from "./historical-market";

test("Swedish market mileage bands use mil-friendly 2,500/5,000 boundaries", () => {
  assert.equal(mileageBucketForKm(0), 0);
  assert.equal(mileageBucketForKm(24_999), 0);
  assert.equal(mileageBucketForKm(25_000), 1);
  assert.equal(mileageBucketForKm(149_999), 4);
  assert.equal(mileageBucketForKm(150_000), 5);
});

test("cohort candidates fall back one stable dimension at a time", () => {
  assert.deepEqual(
    marketCohortCandidates({
      make: "Toyota",
      model: "Corolla",
      fuelType: "hybrid",
      transmission: "automatic",
      modelYear: 2021,
      mileageBucket: 2,
    }).map(({ granularity }) => granularity),
    ["mileage", "model_year", "transmission", "fuel", "model"],
  );
});

test("snapshot default is the last fully completed UTC date", () => {
  assert.equal(
    previousCompletedUtcDate(new Date("2026-08-31T04:00:00Z")).toISOString(),
    "2026-08-30T00:00:00.000Z",
  );
});
