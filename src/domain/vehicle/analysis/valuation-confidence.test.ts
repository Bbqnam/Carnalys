import assert from "node:assert/strict";
import test from "node:test";
import { computeValuationConfidence } from "./valuation-confidence";

test("dense, tight, same-model cohort -> very high confidence", () => {
  const c = computeValuationConfidence({
    tierACount: 12,
    tierBCount: 6,
    tierCCount: 3,
    tierDCount: 0,
    method: "adjusted",
    usedSegmentFallback: false,
    priceDispersionRatio: 0.08,
  });
  assert.ok(c.score >= 70, `score ${c.score}`);
  assert.ok(c.label === "high" || c.label === "very_high");
});

test("sparse cohort -> low confidence, even if the point estimate looks clean", () => {
  const c = computeValuationConfidence({
    tierACount: 1,
    tierBCount: 1,
    tierCCount: 0,
    tierDCount: 0,
    method: "raw_median",
    usedSegmentFallback: false,
    priceDispersionRatio: 0.1,
  });
  assert.ok(c.score <= 45, `score ${c.score}`);
  assert.ok(c.label === "low" || c.label === "very_low");
});

test("no comparables at all -> zero confidence", () => {
  const c = computeValuationConfidence({
    tierACount: 0,
    tierBCount: 0,
    tierCCount: 0,
    tierDCount: 0,
    method: "insufficient",
    usedSegmentFallback: false,
    priceDispersionRatio: NaN,
  });
  assert.equal(c.score, 0);
  assert.equal(c.label, "very_low");
});

test("wide price dispersion lowers confidence even with many comparables", () => {
  const tight = computeValuationConfidence({
    tierACount: 10, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "adjusted", usedSegmentFallback: false, priceDispersionRatio: 0.05,
  });
  const scattered = computeValuationConfidence({
    tierACount: 10, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "adjusted", usedSegmentFallback: false, priceDispersionRatio: 0.45,
  });
  assert.ok(scattered.score < tight.score);
});

test("segment (cross-model) fallback caps confidence even with a large pool", () => {
  const sameModel = computeValuationConfidence({
    tierACount: 15, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "adjusted", usedSegmentFallback: false, priceDispersionRatio: 0.1,
  });
  const crossModel = computeValuationConfidence({
    tierACount: 15, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "adjusted", usedSegmentFallback: true, priceDispersionRatio: 0.1,
  });
  assert.ok(crossModel.score < sameModel.score);
});

test("raw_median (fit could not be computed) scores lower than an adjusted fit, all else equal", () => {
  const adjusted = computeValuationConfidence({
    tierACount: 10, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "adjusted", usedSegmentFallback: false, priceDispersionRatio: 0.15,
  });
  const rawMedian = computeValuationConfidence({
    tierACount: 10, tierBCount: 5, tierCCount: 0, tierDCount: 0,
    method: "raw_median", usedSegmentFallback: false, priceDispersionRatio: 0.15,
  });
  assert.ok(rawMedian.score < adjusted.score);
});
