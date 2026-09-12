import assert from "node:assert/strict";
import test from "node:test";
import { scoreComparable, tierWeight, type SimilarityCandidate, type SimilarityTarget } from "./comparable-similarity";
import { valueVehicle, type ValuationComparable } from "./comparable-valuation";

/**
 * PHASE 15 regression case: a 2021 BMW X3 xDrive30e xLine at ~8,500 mil,
 * asking 328,700 SEK, which the old boolean-tier cohort valued at ~368,000
 * SEK — pulled up by facelift and M Sport-equivalent comparables the old
 * tiers could not distinguish from an exact match.
 *
 * This is a regression case, not a special rule: nothing here is BMW- or
 * X3-specific. It exercises the same `scoreComparable`/`valueVehicle` used
 * for every make, calibrated by the generic `GenerationBand.faceliftFrom`
 * mechanism in rules.ts (which happens to have X3 G01 data — see
 * canonical-vehicle.test.ts). No expected price is hardcoded: the assertions
 * are about comparable weighting, matching the instruction to validate
 * *behavior*, not a number.
 */

const NOW = new Date("2026-09-12T00:00:00Z");

const target: SimilarityTarget = {
  fuelType: "plug_in_hybrid",
  transmission: "automatic",
  drivetrain: "all_wheel_drive",
  bodyStyle: "suv",
  generation: "G01",
  facelift: false,
  trim: "xLine",
  performanceVariant: null,
  modelYear: 2021,
  mileageKm: 85_140, // 8,514 mil
  sellerType: "private",
};
const targetAgeYears = 2026 - 2021;

function realComparable(mileageKm: number, priceAmount: number, trim: string | null = null): { candidate: SimilarityCandidate; priceAmount: number } {
  return {
    candidate: { ...target, trim, observedAt: NOW },
    priceAmount,
  };
}

// The four genuinely comparable live listings from the manual market check:
// same generation (G01), same facelift status (pre-facelift), same
// drivetrain/fuel/transmission, close model year and mileage.
const genuineComparables = [
  realComparable(93_000, 309_000), // 2021 xDrive30e, 9,300 mil
  realComparable(75_980, 314_900, "xLine"), // 2021 xDrive30e xLine, 7,598 mil
  realComparable(115_510, 339_800), // 2021 xDrive30e, 11,551 mil
  realComparable(105_860, 358_700), // 2021 xDrive30e, 10,586 mil
];

// A pool of facelift, M Sport-equivalent, low-mileage PHEVs — real market
// data too, but a materially different product from a pre-facelift xLine.
// This is the kind of cohort contamination that the old tier cascade (no
// facelift/trim/drivetrain awareness) could not tell apart from an exact
// match, and which pulled the valuation up toward ~368,000 SEK.
const facliftMSportDistractors = Array.from({ length: 6 }, (_, i) => ({
  candidate: {
    ...target,
    modelYear: 2022,
    facelift: true,
    trim: null,
    performanceVariant: "M Sport",
    observedAt: NOW,
  } satisfies SimilarityCandidate,
  priceAmount: 430_000 + i * 6_000,
  mileageKm: 25_000 + i * 2_000,
}));

test("REGRESSION: genuine same-generation, same-facelift comparables score in the top tiers", () => {
  for (const { candidate } of genuineComparables) {
    const result = scoreComparable(target, candidate, NOW);
    assert.ok(
      result.tier === "A" || result.tier === "B",
      `expected a strong tier for a genuine comparable, got ${result.tier} (score ${result.score})`,
    );
  }
});

test("REGRESSION: facelift M Sport-equivalent comparables score strictly below every genuine comparable", () => {
  const genuineScores = genuineComparables.map(({ candidate }) => scoreComparable(target, candidate, NOW).score);
  const distractorScores = facliftMSportDistractors.map(({ candidate }) => scoreComparable(target, candidate, NOW).score);

  assert.ok(
    Math.max(...distractorScores) < Math.min(...genuineScores),
    `distractors (${distractorScores}) should all score below genuine comparables (${genuineScores})`,
  );
});

test("REGRESSION: weighted valuation tracks the tight genuine cluster, not the facelift/M-Sport distractors", () => {
  const weighted: ValuationComparable[] = [
    ...genuineComparables.map(({ candidate, priceAmount }) => ({
      priceAmount,
      ageYears: 2026 - candidate.modelYear,
      mileageKm: candidate.mileageKm,
      weight: tierWeight(scoreComparable(target, candidate, NOW).tier),
    })),
    ...facliftMSportDistractors.map(({ candidate, priceAmount, mileageKm }) => ({
      priceAmount,
      ageYears: 2026 - candidate.modelYear,
      mileageKm,
      weight: tierWeight(scoreComparable(target, candidate, NOW).tier),
    })),
  ];

  const valuation = valueVehicle({ ageYears: targetAgeYears, mileageKm: target.mileageKm }, weighted);
  assert.ok(valuation.marketValue !== null, "expected a computable market value");

  // The genuine cluster's own prices span 309,000-358,700 SEK. The old
  // boolean-tier system (no facelift/trim/drivetrain awareness) produced
  // ~368,000 SEK for this exact case by pooling it with cars like the
  // distractors above undifferentiated. The weighted estimate must land
  // meaningfully below that, close to the genuine cluster.
  assert.ok(
    valuation.marketValue! <= 350_000,
    `weighted market value ${valuation.marketValue} was pulled too far toward the facelift/M-Sport distractors (old system: ~368,000)`,
  );
  assert.ok(
    valuation.marketValue! >= 300_000,
    `weighted market value ${valuation.marketValue} collapsed below the genuine cluster's own range`,
  );

  // Sanity: an equal-weight (old-style) median of the same pool would sit
  // noticeably higher, closer to the distractor-inflated figure — otherwise
  // this test isn't actually exercising the fix.
  const unweightedPrices = weighted.map((c) => c.priceAmount).sort((a, b) => a - b);
  const unweightedMedian = unweightedPrices[Math.floor(unweightedPrices.length / 2)];
  assert.ok(
    unweightedMedian > valuation.marketValue!,
    `sanity check failed: unweighted median (${unweightedMedian}) should exceed the weighted estimate (${valuation.marketValue})`,
  );
});
