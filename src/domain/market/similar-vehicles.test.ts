import assert from "node:assert/strict";
import test from "node:test";
import { rankSimilarVehicles, type SimilarVehicle } from "./similar-vehicles";
import { hasFreshHostConfirmation } from "./listing-availability";

const target: SimilarVehicle = { id: "target", vehicleId: "physical-target", make: "Volvo", model: "V60", modelYear: 2021,
  bodyStyle: "estate", fuelType: "diesel", transmission: "automatic", generation: "Mk2", horsepower: 190,
  mileageKm: 80000, mileageKnown: true, priceAmount: 250000 };
test("shopping suggestions exclude own-car syndication, wrong product types and budget violations", () => {
  const make = (id: string, changes: Partial<SimilarVehicle> = {}) => ({ ...target, id, vehicleId: id, ...changes });
  const result = rankSimilarVehicles(target, [make("good"), make("duplicate", { vehicleId: target.vehicleId }),
    make("unknown-mileage", { mileageKnown: false }), make("expensive", { priceAmount: 400000 }),
    make("suv", { bodyStyle: "suv" }), make("petrol", { fuelType: "petrol" }), make("manual", { transmission: "manual" }),
    make("old-generation", { generation: "Mk1" }), make("good-copy", { vehicleId: "good" })]);
  assert.deepEqual(result.map(row => row.id), ["good"]);
});
test("host confirmations expire; an old positive or later inconclusive check is not reusable", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const fresh = { status: "active", availabilityCheckStatus: "active:host", availabilityConfirmedAt: new Date("2026-11-01T11:59:00Z") };
  assert.equal(hasFreshHostConfirmation(fresh, now), true);
  assert.equal(hasFreshHostConfirmation({ ...fresh, availabilityConfirmedAt: new Date("2026-08-01") }, now), false);
  assert.equal(hasFreshHostConfirmation({ ...fresh, availabilityCheckStatus: "inconclusive" }, now), false);
  assert.equal(hasFreshHostConfirmation({ ...fresh, status: "removed" }, now), false);
  assert.equal(hasFreshHostConfirmation({ ...fresh, availabilityCheckStatus: "active" }, now), false);
});
