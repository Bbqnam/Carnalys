import assert from "node:assert/strict";
import test from "node:test";
import { assessAskingPrice } from "@/domain/vehicle/analysis/price-plausibility";
import { closestValuationCandidates, constructIndependentCohort, type AnalystMarketCandidate, type AnalystMarketTarget } from "./market";

const target: AnalystMarketTarget = {
  id: "target", vehicleId: "vehicle-target", make: "Volvo", model: "V60", fuelType: "diesel",
  transmission: "automatic", bodyStyle: "estate", performanceVariant: null, modelYear: 2021,
  mileageKm: 70_000, priceAmount: 250_000, municipality: "Stockholm", synchronizedAt: new Date("2026-09-01"),
  monthlyCostAmount: null, title: "Volvo V60", description: null,
};

function candidate(id: string, overrides: Partial<AnalystMarketCandidate> = {}): AnalystMarketCandidate {
  return { ...target, id, vehicleId: `vehicle-${id}`, monthlyCostAmount: undefined, title: undefined, description: undefined, ...overrides } as AnalystMarketCandidate;
}

test("independent cohort construction uses the exact tier and excludes the target physical vehicle", () => {
  const cohort = constructIndependentCohort(target, [
    candidate("same-vehicle", { vehicleId: target.vehicleId }),
    candidate("a", { priceAmount: 235_000 }),
    candidate("b", { priceAmount: 250_000, modelYear: 2020 }),
    candidate("c", { priceAmount: 265_000, mileageKm: 80_000 }),
  ]);
  assert.equal(cohort.tier, "exact");
  assert.equal(cohort.candidates.length, 3);
  assert.equal(cohort.candidates.some(({ vehicleId }) => vehicleId === target.vehicleId), false);
  assert.match(cohort.definition, /one active advert per physical vehicle/i);
});

test("comparable selection is deterministic, nearest-first, and trims a suspicious outlier", () => {
  const selected = closestValuationCandidates(target, [
    candidate("b", { priceAmount: 255_000, mileageKm: 72_000 }),
    candidate("a", { priceAmount: 250_000, mileageKm: 72_000 }),
    candidate("c", { priceAmount: 245_000, mileageKm: 80_000 }),
    candidate("outlier", { priceAmount: 2_000_000, mileageKm: 71_000 }),
  ]);
  assert.deepEqual(selected.map(({ id }) => id), ["a", "b", "c"]);
});

test("suspicious target prices are quarantined rather than called bargains", () => {
  const assessment = assessAskingPrice({ askingPrice: 4_995, modelYear: 2024, currentYear: 2026, marketValue: 280_000, comparableCount: 20, text: "Leasing 4 995 kr/mån" });
  assert.equal(assessment.usable, false);
  assert.notEqual(assessment.reason, null);
});

