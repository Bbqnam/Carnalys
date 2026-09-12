import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBuyConfidence,
  computeDealScore,
  conditionScores,
  priceValueScore,
  shrinkTowardNeutral,
  v11VehicleScores,
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

test("v11 price curve matches the requested points and flattens after 30 percent", () => {
  assert.equal(priceValueScore(-0.3), 10);
  assert.equal(priceValueScore(-0.2), 22);
  assert.equal(priceValueScore(-0.1), 36);
  assert.equal(priceValueScore(0), 50);
  assert.equal(priceValueScore(0.1), 64);
  assert.equal(priceValueScore(0.2), 77);
  assert.equal(priceValueScore(0.3), 86);
  assert.equal(priceValueScore(0.4), 89);
  assert.equal(priceValueScore(0.5), 91);
});

test("the centered v11 weights make a neutral complete car score 50", () => {
  const value = computeDealScore({
    priceDelta: 0,
    canComparePrice: true,
    comparableCount: dense,
    mileageScore: 50,
    ageScore: 50,
    ownerScore: 50,
    equipmentScore: 50,
    transparencyScore: 50,
    sellerProtectionScore: 50,
    serviceModifier: 0,
    defectModifier: 0,
  }).value;
  assert.equal(value, 50);
});

test("a better equipped otherwise identical car scores higher", () => {
  const score = (equipmentScore: number) => computeDealScore({
    priceDelta: 0.1,
    canComparePrice: true,
    comparableCount: dense,
    equipmentScore,
  }).value!;
  assert.ok(score(80) > score(35));
});

test("the same mileage scores much better on an old car than a young car", () => {
  const young = v11VehicleScores({ ageYears: 3, mileageKm: 150_000, mileageKnown: true, ownerCount: 2 });
  const old = v11VehicleScores({ ageYears: 14, mileageKm: 150_000, mileageKnown: true, ownerCount: 2 });
  assert.ok(old.mileageScore > young.mileageScore + 20, `${old.mileageScore} vs ${young.mileageScore}`);
});

test("the same owner count scores worse on a young car than an old car", () => {
  const young = v11VehicleScores({ ageYears: 2, mileageKm: 20_000, mileageKnown: true, ownerCount: 4 });
  const old = v11VehicleScores({ ageYears: 14, mileageKm: 150_000, mileageKnown: true, ownerCount: 4 });
  assert.ok(old.ownerScore > young.ownerScore + 10, `${old.ownerScore} vs ${young.ownerScore}`);
});

test("thin cohorts are pulled toward neutral; dense cohorts are not", () => {
  const thin = computeDealScore({ priceDelta: 0.3, canComparePrice: true, comparableCount: 4 }).value!;
  const rich = computeDealScore({ priceDelta: 0.3, canComparePrice: true, comparableCount: 60 }).value!;
  assert.ok(thin < rich, `thin ${thin} should be < dense ${rich}`);
  assert.ok(Math.abs(thin - 50) < Math.abs(rich - 50));
  assert.ok(rich >= 65, `dense 30%-below deal should be strong, got ${rich}`);
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
  assert.equal(priceValueScore(5), 91);
  assert.equal(priceValueScore(-5), 10);
});

test("a major defect or ranking quarantine produces unrated", () => {
  assert.equal(computeDealScore({
    priceDelta: 0.3,
    canComparePrice: true,
    comparableCount: dense,
    defectModifier: null,
  }).value, null);
  assert.equal(computeDealScore({
    priceDelta: 0.3,
    canComparePrice: true,
    comparableCount: dense,
    eligibleForRanking: false,
  }).value, null);
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
