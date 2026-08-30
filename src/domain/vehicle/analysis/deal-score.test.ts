import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBuyConfidence,
  computeDealScore,
  conditionScores,
  priceValueScore,
  shrinkTowardNeutral,
  NEUTRAL_SCORE,
} from "./deal-score";

const dense = 40;

test("priced at market scores about 50", () => {
  const { value } = computeDealScore({
    priceDelta: 0,
    canComparePrice: true,
    comparableCount: dense,
  });
  assert.ok(value !== null && Math.abs(value - 50) <= 2, `got ${value}`);
});

test("Philosophy A: the curve is roughly symmetric and matches the target bands", () => {
  const at = (delta: number) =>
    computeDealScore({ priceDelta: delta, canComparePrice: true, comparableCount: dense }).value!;
  // below market -> better score
  assert.ok(at(0.1) >= 58 && at(0.1) <= 66, `10% below => ${at(0.1)}`);
  assert.ok(at(0.2) >= 68 && at(0.2) <= 80, `20% below => ${at(0.2)}`);
  assert.ok(at(0.3) >= 80 && at(0.3) <= 92, `30% below => ${at(0.3)}`);
  // above market -> worse score, roughly mirrored
  assert.ok(at(-0.1) >= 34 && at(-0.1) <= 42, `10% above => ${at(-0.1)}`);
  assert.ok(at(-0.2) >= 20 && at(-0.2) <= 32, `20% above => ${at(-0.2)}`);
  assert.ok(at(-0.3) <= 20, `30% above => ${at(-0.3)}`);
  // symmetry: below and above by the same amount should be about equidistant from 50
  assert.ok(Math.abs((at(0.15) - 50) + (at(-0.15) - 50)) <= 6, "asymmetric");
});

test("age, mileage and absolute price do NOT enter the Deal Score", () => {
  // computeDealScore's signature has no such inputs; a fixed delta must give a
  // fixed score regardless of what kind of car it is.
  const a = computeDealScore({ priceDelta: 0.05, canComparePrice: true, comparableCount: dense }).value;
  const b = computeDealScore({ priceDelta: 0.05, canComparePrice: true, comparableCount: dense }).value;
  assert.equal(a, b);
});

test("thin cohorts are pulled toward neutral; dense cohorts are not", () => {
  const thin = computeDealScore({ priceDelta: 0.3, canComparePrice: true, comparableCount: 4 }).value!;
  const rich = computeDealScore({ priceDelta: 0.3, canComparePrice: true, comparableCount: 60 }).value!;
  assert.ok(thin < rich, `thin ${thin} should be < dense ${rich}`);
  assert.ok(Math.abs(thin - 50) < Math.abs(rich - 50));
  assert.ok(rich >= 82, `dense 30%-below deal should be strong, got ${rich}`);
});

test("no defensible price comparison => null, never 50", () => {
  const r = computeDealScore({ priceDelta: 0, canComparePrice: false, comparableCount: 0 });
  assert.equal(r.value, null);
});

test("shrinkTowardNeutral maths", () => {
  assert.equal(shrinkTowardNeutral(90, 0), NEUTRAL_SCORE);
  assert.equal(shrinkTowardNeutral(50, 40), 50);
  // n/(n+8): at n=8 keeps half the distance
  assert.equal(shrinkTowardNeutral(90, 8), 70);
});

test("priceValueScore is centred on 50 and clamped 10..95", () => {
  assert.equal(priceValueScore(0), 50);
  assert.equal(priceValueScore(5), 95);
  assert.equal(priceValueScore(-5), 10);
});

// ---- Buy Confidence ----

const goodCondition = { ageYears: 3, mileageKm: 40_000 };

test("unknown owner count is not treated as a good owner count", () => {
  const known1 = conditionScores({ ...goodCondition, ownerCount: 1, serviceHistory: "complete" });
  const unknownOwner = conditionScores({ ...goodCondition, ownerCount: null, serviceHistory: "complete" });
  assert.ok(unknownOwner.ownerScore < known1.ownerScore - 30, "unknown owner scored like a single owner");
  assert.equal(unknownOwner.hasOwnerData, false);

  const bcKnown = computeBuyConfidence({
    ageScore: 92, mileageScore: 92, ownerScore: known1.ownerScore,
    serviceHistoryScore: 100, hasOwnerData: true, hasServiceHistory: true,
  });
  const bcUnknown = computeBuyConfidence({
    ageScore: 92, mileageScore: 92, ownerScore: unknownOwner.ownerScore,
    serviceHistoryScore: 100, hasOwnerData: false, hasServiceHistory: true,
  });
  assert.ok(bcUnknown < bcKnown, `${bcUnknown} !< ${bcKnown}`);
});

test("unknown service history is not treated as full service history", () => {
  const full = conditionScores({ ...goodCondition, ownerCount: 2, serviceHistory: "complete" });
  const unknown = conditionScores({ ...goodCondition, ownerCount: 2, serviceHistory: "unknown" });
  assert.ok(unknown.serviceHistoryScore <= 45, `got ${unknown.serviceHistoryScore}`);
  assert.ok(full.serviceHistoryScore - unknown.serviceHistoryScore >= 40);
});

test("a listing that states neither owners nor history takes an extra hit", () => {
  const base = { ageScore: 70, mileageScore: 70, serviceHistoryScore: 40, ownerScore: 45 };
  const onlyOneMissing = computeBuyConfidence({ ...base, serviceHistoryScore: 62, hasOwnerData: false, hasServiceHistory: true });
  const bothMissing = computeBuyConfidence({ ...base, hasOwnerData: false, hasServiceHistory: false });
  assert.ok(bothMissing < onlyOneMissing);
});

test("Buy Confidence rises with better condition and history", () => {
  const worst = computeBuyConfidence({
    ageScore: 20, mileageScore: 15, ownerScore: 20, serviceHistoryScore: 25,
    hasOwnerData: true, hasServiceHistory: true,
  });
  const best = computeBuyConfidence({
    ageScore: 100, mileageScore: 100, ownerScore: 100, serviceHistoryScore: 100,
    hasOwnerData: true, hasServiceHistory: true,
  });
  assert.ok(worst <= 25 && best >= 90, `${worst} / ${best}`);
});
