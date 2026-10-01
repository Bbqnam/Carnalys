import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreComparable,
  tierWeight,
  recencyDecayFactor,
  type SimilarityCandidate,
  type SimilarityTarget,
} from "./comparable-similarity";

const NOW = new Date("2026-09-12T00:00:00Z");

function target(overrides: Partial<SimilarityTarget> = {}): SimilarityTarget {
  return {
    fuelType: "plug_in_hybrid",
    transmission: "automatic",
    drivetrain: "all_wheel_drive",
    bodyStyle: "suv",
    generation: "G01",
    facelift: false,
    trim: "xLine",
    performanceVariant: null,
    modelYear: 2021,
    mileageKm: 85_140,
    sellerType: "private",
    ...overrides,
  };
}

function candidate(overrides: Partial<SimilarityCandidate> = {}): SimilarityCandidate {
  return {
    ...target(),
    observedAt: NOW,
    ...overrides,
  };
}

test("near-identical car (same generation/facelift/drivetrain/trim, close mileage) scores tier A", () => {
  const r = scoreComparable(
    target(),
    candidate({ mileageKm: 93_000, trim: "xLine" }),
    NOW,
  );
  assert.equal(r.tier, "A");
  assert.ok(r.score >= 85, `score ${r.score}`);
  assert.ok(!r.hardReject);
});

test("REGRESSION (BMW X3): a newer facelift, pricier-trim comparable scores materially lower than the tight real cluster", () => {
  const realComps: SimilarityCandidate[] = [
    candidate({ mileageKm: 93_000 }), // 2021 xDrive30e, 9,300 mil
    candidate({ mileageKm: 75_980, trim: "xLine" }), // 2021 xDrive30e xLine, 7,598 mil
    candidate({ mileageKm: 115_510 }), // 2021 xDrive30e, 11,551 mil
    candidate({ mileageKm: 105_860 }), // 2021 xDrive30e, 10,586 mil
  ];
  // A 2022 facelift, M Sport-equivalent PHEV — real market signal, but not
  // the same product as a 2021 pre-facelift xLine.
  const distractor = candidate({
    modelYear: 2022,
    facelift: true,
    trim: null,
    performanceVariant: "M Sport",
    mileageKm: 40_000,
  });

  const realScores = realComps.map((c) => scoreComparable(target(), c, NOW));
  const distractorScore = scoreComparable(target(), distractor, NOW);

  for (const r of realScores) {
    assert.ok(r.tier === "A" || r.tier === "B", `expected strong tier, got ${r.tier} (score ${r.score})`);
  }
  assert.ok(
    distractorScore.score < Math.min(...realScores.map((r) => r.score)),
    `distractor (${distractorScore.score}) should score below every genuine comparable (${realScores.map((r) => r.score)})`,
  );
  assert.ok(
    tierWeight(distractorScore.tier) < tierWeight(realScores[0].tier),
    "distractor's valuation weight must be lower than a genuine comparable's",
  );
});

test("different fuel type is a hard reject regardless of everything else matching", () => {
  const r = scoreComparable(target(), candidate({ fuelType: "petrol" }), NOW);
  assert.equal(r.hardReject, true);
  assert.equal(r.score, 0);
});

test("powertrain class separates HEV, PHEV and MHEV even when source fuel enums are noisy", () => {
  const samePhev = scoreComparable(
    target({ fuelType: "petrol", powertrainType: "phev" }),
    candidate({ fuelType: "self_charging_hybrid", powertrainType: "phev" }),
    NOW,
  );
  const mhev = scoreComparable(
    target({ fuelType: "petrol", powertrainType: "phev" }),
    candidate({ fuelType: "petrol", powertrainType: "mhev" }),
    NOW,
  );
  assert.equal(samePhev.hardReject, false);
  assert.equal(mhev.hardReject, true);
});

test("facelift boundary: same generation, different facelift status scores meaningfully lower but not zero", () => {
  const sameFacelift = scoreComparable(target(), candidate({ facelift: false }), NOW);
  const differentFacelift = scoreComparable(target(), candidate({ facelift: true }), NOW);
  assert.ok(differentFacelift.score < sameFacelift.score);
  assert.ok(sameFacelift.score - differentFacelift.score < 40, "should be a meaningful but not total penalty");
  assert.ok(differentFacelift.score > 0);
});

test("unknown generation/facelift is neutral, never scored as a confirmed mismatch", () => {
  const bothUnknown = scoreComparable(
    target({ generation: null, facelift: null }),
    candidate({ generation: null, facelift: null }),
    NOW,
  );
  const knownMismatch = scoreComparable(
    target(),
    candidate({ generation: "F25", facelift: null }),
    NOW,
  );
  assert.ok(bothUnknown.score > knownMismatch.score);
});

test("AWD vs FWD drivetrain mismatch reduces score", () => {
  const same = scoreComparable(target(), candidate({ drivetrain: "all_wheel_drive" }), NOW);
  const different = scoreComparable(target(), candidate({ drivetrain: "front_wheel_drive" }), NOW);
  assert.ok(different.score < same.score);
});

test("trim difference (base vs performance-equivalent) reduces score", () => {
  const sameTrim = scoreComparable(target(), candidate({ trim: "xLine" }), NOW);
  const perfVariant = scoreComparable(
    target(),
    candidate({ trim: null, performanceVariant: "M Sport" }),
    NOW,
  );
  assert.ok(perfVariant.score < sameTrim.score);
});

test("dealer vs private seller reduces score slightly but never disqualifies", () => {
  const private_ = scoreComparable(target({ sellerType: "private" }), candidate({ sellerType: "private" }), NOW);
  const dealer = scoreComparable(target({ sellerType: "private" }), candidate({ sellerType: "dealer" }), NOW);
  assert.ok(dealer.score < private_.score);
  assert.ok(dealer.score > private_.score - 10);
  assert.notEqual(dealer.tier, undefined);
});

test("mileage gap is scored on a continuous decay within its spread, floored (not negative) beyond it", () => {
  const close = scoreComparable(target(), candidate({ mileageKm: 90_000 }), NOW);
  const medium = scoreComparable(target(), candidate({ mileageKm: 120_000 }), NOW);
  const far = scoreComparable(target(), candidate({ mileageKm: 250_000 }), NOW);
  const veryFar = scoreComparable(target(), candidate({ mileageKm: 900_000 }), NOW);
  assert.ok(close.score > medium.score, `${close.score} vs ${medium.score}`);
  assert.ok(medium.score > far.score, `${medium.score} vs ${far.score}`);
  // Beyond the mileage-relevance spread, further distance adds no extra
  // penalty (the car isn't "more different" past a point) but never negative.
  assert.equal(far.score, veryFar.score);
  assert.ok(veryFar.score >= 0);
});

test("recency decay: an old observation scores lower and weighs less than a fresh one", () => {
  const fresh = scoreComparable(target(), candidate({ observedAt: NOW }), NOW);
  const nineMonthsOld = scoreComparable(
    target(),
    candidate({ observedAt: new Date(NOW.getTime() - 270 * 86_400_000) }),
    NOW,
  );
  assert.ok(nineMonthsOld.score < fresh.score);

  const freshFactor = recencyDecayFactor(NOW, NOW);
  const oldFactor = recencyDecayFactor(new Date(NOW.getTime() - 270 * 86_400_000), NOW);
  assert.equal(freshFactor, 1);
  assert.ok(oldFactor < 0.05, `expected steep decay by 270 days, got ${oldFactor}`);
});

test("tier weights are strictly ordered A > B > C > D", () => {
  assert.ok(tierWeight("A") > tierWeight("B"));
  assert.ok(tierWeight("B") > tierWeight("C"));
  assert.ok(tierWeight("C") > tierWeight("D"));
  assert.ok(tierWeight("D") > 0, "even a weak comparable should retain some, small, influence");
});

test("rare vehicle: sparse but genuinely close data still scores well on its own merits", () => {
  const r = scoreComparable(
    target({ generation: null, facelift: null, trim: null }),
    candidate({ generation: null, facelift: null, trim: null, mileageKm: 86_000 }),
    NOW,
  );
  assert.ok(r.score >= 60, `expected a decent score from year/mileage/drivetrain alone, got ${r.score}`);
});
