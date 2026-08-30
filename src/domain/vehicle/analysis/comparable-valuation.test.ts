import assert from "node:assert/strict";
import test from "node:test";
import { computeDealScore } from "./deal-score";
import {
  valueVehicle,
  fitAgeMileageSlopes,
  type ValuationComparable,
} from "./comparable-valuation";

/** Deterministic PRNG so noisy fixtures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** price = base - perYear*age - perKm*km (+ optional noise). */
function linearCohort(opts: {
  n: number;
  base: number;
  perYear: number;
  perKm: number;
  ageMin: number;
  ageMax: number;
  kmMin: number;
  kmMax: number;
  noise?: number;
  seed?: number;
}): ValuationComparable[] {
  const rnd = mulberry32(opts.seed ?? 1);
  return Array.from({ length: opts.n }, () => {
    const ageYears = opts.ageMin + rnd() * (opts.ageMax - opts.ageMin);
    const mileageKm = Math.round(opts.kmMin + rnd() * (opts.kmMax - opts.kmMin));
    const clean = opts.base - opts.perYear * ageYears - opts.perKm * mileageKm;
    const noise = opts.noise ? (rnd() - 0.5) * 2 * opts.noise : 0;
    return { priceAmount: Math.round(clean * (1 + noise)), ageYears, mileageKm };
  });
}

const rawMedian = (cs: ValuationComparable[]) => {
  const s = cs.map((c) => c.priceAmount).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

test("recovers a noiseless linear surface at the target's own spec", () => {
  const cohort = linearCohort({
    n: 36, base: 400_000, perYear: 20_000, perKm: 0.5,
    ageMin: 1, ageMax: 8, kmMin: 10_000, kmMax: 150_000,
  });
  const v = valueVehicle({ ageYears: 4, mileageKm: 60_000 }, cohort);
  assert.equal(v.method, "adjusted");
  // 400000 - 80000 - 30000 = 290000
  assert.ok(Math.abs(v.marketValue! - 290_000) <= 3_000, `got ${v.marketValue}`);
});

test("REGRESSION: a high-mileage car is valued below the cohort median, not at it", () => {
  // A cohort centred on ~120k km; the target has 200k km and is priced fairly
  // *for 200k km*. Old behaviour: median of the cohort (~200k SEK) => target
  // looks ~30% under market => Deal ~85. New behaviour must value the target
  // near its own fair price and score it ~neutral.
  const cohort = linearCohort({
    n: 40, base: 320_000, perYear: 0, perKm: 1.0,
    ageMin: 4, ageMax: 4, kmMin: 40_000, kmMax: 200_000,
  });
  const cohortMedian = rawMedian(cohort); // ~ 320000 - 120000 = 200000
  const fairPriceFor200k = 320_000 - 200_000; // 120000

  const v = valueVehicle({ ageYears: 4, mileageKm: 200_000 }, cohort);
  assert.equal(v.method, "adjusted");
  assert.ok(
    v.marketValue! < cohortMedian * 0.8,
    `MV ${v.marketValue} should be well below cohort median ${cohortMedian}`,
  );
  assert.ok(Math.abs(v.marketValue! - fairPriceFor200k) <= 15_000, `MV ${v.marketValue}`);

  // Deal Score with the NEW valuation: fairly priced => ~50.
  const deltaNew = (v.marketValue! - fairPriceFor200k) / v.marketValue!;
  const dealNew = computeDealScore({ priceDelta: deltaNew, canComparePrice: true, comparableCount: v.comparableCount }).value!;
  assert.ok(Math.abs(dealNew - 50) <= 10, `new deal ${dealNew} should be ~neutral`);

  // Deal Score if we had (wrongly) used the raw cohort median: ~85.
  const deltaOld = (cohortMedian - fairPriceFor200k) / cohortMedian;
  const dealOld = computeDealScore({ priceDelta: deltaOld, canComparePrice: true, comparableCount: v.comparableCount }).value!;
  assert.ok(dealOld >= 80, `old-style deal would have been ${dealOld}`);
});

test("a low-mileage car is valued above the cohort median", () => {
  const cohort = linearCohort({
    n: 40, base: 300_000, perYear: 0, perKm: 1.0,
    ageMin: 4, ageMax: 4, kmMin: 40_000, kmMax: 200_000,
  });
  const cohortMedian = rawMedian(cohort);
  const v = valueVehicle({ ageYears: 4, mileageKm: 45_000 }, cohort);
  assert.equal(v.method, "adjusted");
  assert.ok(v.marketValue! > cohortMedian * 1.1, `MV ${v.marketValue} vs median ${cohortMedian}`);
});

test("fairly-priced cars score ~50 regardless of age/mileage/price band", () => {
  const scenarios = [
    { label: "new expensive", base: 700_000, perYear: 40_000, perKm: 1.0, ageMin: 0, ageMax: 3, kmMin: 0, kmMax: 40_000, tAge: 1, tKm: 12_000 },
    { label: "old cheap", base: 190_000, perYear: 4_500, perKm: 0.16, ageMin: 10, ageMax: 18, kmMin: 120_000, kmMax: 260_000, tAge: 14, tKm: 190_000 },
    { label: "mid high-mileage", base: 350_000, perYear: 15_000, perKm: 0.9, ageMin: 3, ageMax: 9, kmMin: 60_000, kmMax: 240_000, tAge: 6, tKm: 210_000 },
    { label: "mid low-mileage", base: 350_000, perYear: 15_000, perKm: 0.9, ageMin: 3, ageMax: 9, kmMin: 20_000, kmMax: 120_000, tAge: 6, tKm: 30_000 },
  ];
  for (const s of scenarios) {
    const cohort = linearCohort({ n: 44, ...s, noise: 0.03, seed: 7 });
    const v = valueVehicle({ ageYears: s.tAge, mileageKm: s.tKm }, cohort);
    assert.ok(v.marketValue !== null, `${s.label}: no value`);
    // ask exactly the model's estimate for this spec
    const ask = s.base - s.perYear * s.tAge - s.perKm * s.tKm;
    const delta = (v.marketValue! - ask) / v.marketValue!;
    const deal = computeDealScore({ priceDelta: delta, canComparePrice: true, comparableCount: v.comparableCount }).value!;
    assert.ok(Math.abs(deal - 50) <= 12, `${s.label}: fairly priced but Deal ${deal} (delta ${(delta * 100).toFixed(1)}%)`);
  }
});

test("genuine bargain and overpriced cars land in the right bands", () => {
  const cohort = linearCohort({
    n: 40, base: 300_000, perYear: 12_000, perKm: 0.8,
    ageMin: 3, ageMax: 8, kmMin: 30_000, kmMax: 140_000, noise: 0.03, seed: 3,
  });
  const v = valueVehicle({ ageYears: 5, mileageKm: 80_000 }, cohort);
  const mv = v.marketValue!;
  const dealAt = (ask: number) =>
    computeDealScore({ priceDelta: (mv - ask) / mv, canComparePrice: true, comparableCount: v.comparableCount }).value!;
  assert.ok(dealAt(mv * 0.78) >= 75, `22% under => ${dealAt(mv * 0.78)}`);
  assert.ok(dealAt(mv * 1.12) <= 42 && dealAt(mv * 1.12) >= 28, `12% over => ${dealAt(mv * 1.12)}`);
  assert.ok(dealAt(mv * 1.3) <= 22, `30% over => ${dealAt(mv * 1.3)}`);
});

test("thin cohort -> insufficient; dense cohort -> a real estimate", () => {
  const two = linearCohort({ n: 2, base: 200_000, perYear: 10_000, perKm: 0.5, ageMin: 3, ageMax: 5, kmMin: 40_000, kmMax: 90_000 });
  assert.equal(valueVehicle({ ageYears: 4, mileageKm: 60_000 }, two).method, "insufficient");

  const dense = linearCohort({ n: 50, base: 200_000, perYear: 10_000, perKm: 0.5, ageMin: 2, ageMax: 9, kmMin: 20_000, kmMax: 160_000 });
  const v = valueVehicle({ ageYears: 4, mileageKm: 60_000 }, dense);
  assert.equal(v.method, "adjusted");
  assert.ok(v.comparableCount >= 20);
});

test("narrow-age cohort still adjusts for mileage (age term dropped, not the whole fit)", () => {
  const cohort = linearCohort({
    n: 30, base: 500_000, perYear: 0, perKm: 1.2,
    ageMin: 1, ageMax: 1.4, kmMin: 5_000, kmMax: 60_000,
  });
  const slopes = fitAgeMileageSlopes(cohort)!;
  assert.equal(slopes.bAge, 0);
  assert.ok(slopes.bMileage < 0);
  const low = valueVehicle({ ageYears: 1, mileageKm: 8_000 }, cohort).marketValue!;
  const high = valueVehicle({ ageYears: 1, mileageKm: 55_000 }, cohort).marketValue!;
  assert.ok(low > high, `low-km ${low} should exceed high-km ${high}`);
});

test("price outliers are trimmed before the estimate", () => {
  const cohort = linearCohort({ n: 38, base: 250_000, perYear: 8_000, perKm: 0.4, ageMin: 3, ageMax: 8, kmMin: 40_000, kmMax: 140_000 });
  const withGarbage: ValuationComparable[] = [
    ...cohort,
    { priceAmount: 1_500, ageYears: 5, mileageKm: 90_000 }, // sanitized out
    { priceAmount: 9_000_000, ageYears: 5, mileageKm: 90_000 }, // sanitized out
    { priceAmount: 12_000, ageYears: 5, mileageKm: 90_000 }, // trimmed (<0.4x median)
  ];
  const clean = valueVehicle({ ageYears: 5, mileageKm: 90_000 }, cohort).marketValue!;
  const dirty = valueVehicle({ ageYears: 5, mileageKm: 90_000 }, withGarbage).marketValue!;
  assert.ok(Math.abs(clean - dirty) <= 5_000, `outliers moved MV ${clean} -> ${dirty}`);
});

test("the adjusted estimate cannot run away from the plain median", () => {
  // Pathological: target far outside the cohort's mileage range.
  const cohort = linearCohort({ n: 40, base: 400_000, perYear: 0, perKm: 2.0, ageMin: 4, ageMax: 4, kmMin: 10_000, kmMax: 60_000 });
  const v = valueVehicle({ ageYears: 4, mileageKm: 400_000 }, cohort);
  const plain = rawMedian(cohort);
  // The clamp holds the estimate at ~0.5x the plain median instead of letting
  // the extrapolation drive it to zero or negative.
  assert.ok(v.marketValue! >= plain * 0.45, `MV ${v.marketValue} ran below 0.5x plain ${plain}`);
  assert.ok(v.marketValue! <= plain, `MV ${v.marketValue} should still be below the plain median`);
});
