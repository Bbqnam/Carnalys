import test from "node:test";
import assert from "node:assert/strict";
import { classifyFuelType } from "./fuel-classifier";

test("generic hybrid text never promotes to PHEV", () => {
  const result = classifyFuelType({ sourceFuelType: "plug_in_hybrid", title: "Toyota RAV4 2.5 Hybrid AWD 222 hk" });
  assert.equal(result.fuelType, "self_charging_hybrid");
  assert.ok(result.confidence > 0.5);
});

test("actual plug in hybrid requires explicit plug evidence", () => {
  const result = classifyFuelType({ sourceFuelType: "self_charging_hybrid", title: "SUV Plug-in Hybrid AWD PHEV" });
  assert.equal(result.fuelType, "plug_in_hybrid");
  assert.ok(result.evidence.some((x) => x.includes("plug in")));
});

test("BEV", () => {
  assert.equal(classifyFuelType({ sourceFuelType: "electric", title: "Fully electric BEV" }).fuelType, "electric");
});

test("petrol", () => {
  assert.equal(classifyFuelType({ sourceFuelType: "petrol", title: "2.0 bensin automat" }).fuelType, "petrol");
});

test("diesel", () => {
  assert.equal(classifyFuelType({ sourceFuelType: "diesel", title: "2.0 diesel automat" }).fuelType, "diesel");
});

test("conflicting strong source information becomes ambiguous", () => {
  const result = classifyFuelType({ sourceFuelType: "diesel", title: "Fully electric BEV" });
  assert.equal(result.fuelType, "electric");
  assert.ok(result.contradictions.length > 0);
});

test("missing fuel information stays unknown", () => {
  const result = classifyFuelType({ sourceFuelType: "other", title: "Family SUV automatic" });
  assert.equal(result.fuelType, "other");
  assert.equal(result.confidence, 0);
});

test("RAV4 222 hp HEV and 306 hp PHEV separate from evidence, not model hardcoding", () => {
  const hev = classifyFuelType({ sourceFuelType: "plug_in_hybrid", title: "Toyota RAV4 2.5 Hybrid AWD 222 hp", horsepower: 222 });
  const phev = classifyFuelType({ sourceFuelType: "self_charging_hybrid", title: "Toyota RAV4 Plug-in Hybrid AWD 306 hp", horsepower: 306 });
  assert.equal(hev.fuelType, "self_charging_hybrid");
  assert.equal(phev.fuelType, "plug_in_hybrid");
});
