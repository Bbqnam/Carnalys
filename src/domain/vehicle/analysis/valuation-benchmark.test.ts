import assert from "node:assert/strict";
import test from "node:test";
import { calibrateLogRadius, independentPeers, ordinaryMedian, predictBenchmark, strictComparable, summarizePredictions, trainLogRidge, type BenchmarkVehicle } from "./valuation-benchmark";
import { valueVehicle } from "./comparable-valuation";
import { conditionScores } from "./deal-score";

const now = new Date("2026-11-01");
const row: BenchmarkVehicle = { id: "a", vehicleId: "a", make: "Volvo", model: "V60", generation: "Mk2", facelift: false,
  trim: "Momentum", performanceVariant: null, fuelType: "diesel", powertrainType: "combustion", transmission: "automatic",
  drivetrain: "front_wheel_drive", bodyStyle: "estate", horsepower: 190, engineDisplacement: 1969, modelYear: 2021,
  mileageKm: 80000, mileageKnown: true, priceAmount: 250000, sellerType: "dealer", observedAt: now, firstSeenAt: now,
  validationStatus: "valid", valuationEligible: true, servedValue: null, servedMethodology: null, servedConfidence: null };
test("physical-vehicle holdout excludes other source listings of the evaluated car", () => {
  assert.deepEqual(independentPeers(row, [row, { ...row, id: "syndicated" }, { ...row, id: "b", vehicleId: "b" }]).map(x => x.id), ["b"]);
});
test("strict contracts cannot compensate a known fuel, body or engine mismatch with other matches", () => {
  const peer = { ...row, id: "b", vehicleId: "b" };
  assert.equal(strictComparable(row, peer), true);
  for (const patch of [{ fuelType: "petrol" }, { bodyStyle: "convertible" }, { horsepower: 300 }, { generation: null }, { mileageKnown: false }]) {
    assert.equal(strictComparable(row, { ...peer, ...patch }), false);
  }
  assert.equal(strictComparable({ ...row, powertrainType: null }, { ...peer, powertrainType: null }), false);
  assert.equal(ordinaryMedian([100, 200, 300]), 200);
});
test("the strict challenger is invariant to the evaluated vehicle asking price", () => {
  const peers = Array.from({ length: 12 }, (_, i) => ({ ...row, id: `p${i}`, vehicleId: `p${i}`, mileageKm: 50000 + i * 5000, priceAmount: 280000 - i * 2000 }));
  const model = trainLogRidge(peers, now, 1);
  const first = predictBenchmark("strict-median", row, peers, model, now);
  assert.equal(predictBenchmark("strict-median", { ...row, priceAmount: 50000 }, peers, model, now), first);
  assert.equal(predictBenchmark("pooled-log-ridge", { ...row, priceAmount: 50000 }, peers, model, now), model.predict(row));
});
test("coverage counts abstentions and finite-sample calibration declines an unsupported interval", () => {
  const predictions = [{ vehicleId: "a", actual: 100, predicted: 110, stratum: "x" }, { vehicleId: "b", actual: 100, predicted: null, stratum: "x" }];
  assert.equal(summarizePredictions(predictions).coverage, 0.5);
  assert.equal(calibrateLogRadius(predictions), null);
});
test("calculation evidence contains only selected comparables and their actual adjustments", () => {
  const inputs = Array.from({ length: 45 }, (_, i) => ({ listingId: String(i), priceAmount: 200000 - i * 1000, ageYears: 5, mileageKm: 50000 + i * 1000, weight: i === 44 ? 0.01 : 1 }));
  const value = valueVehicle({ ageYears: 5, mileageKm: 70000 }, inputs);
  assert.equal(value.comparables.length, value.comparableCount);
  assert.ok(value.comparables.length <= 40);
  assert.ok(!value.comparables.some(x => x.listingId === "44"));
  assert.ok(value.comparables.every(x => Number.isFinite(x.adjustedPriceAmount)));
  assert.equal(conditionScores({ ageYears: 5, mileageKm: 0, mileageKnown: false, ownerCount: null, serviceHistory: "unknown" }).mileageScore, 50);
});
