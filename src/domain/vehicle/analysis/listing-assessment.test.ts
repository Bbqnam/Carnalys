import assert from "node:assert/strict";
import test from "node:test";
import {
  assessDefects,
  assessMileage,
  classifyVehicleKind,
  defectModifier,
  serviceHistoryModifier,
  sellerProtectionScore,
  transparencyScore,
} from "./listing-assessment";

test("zero mileage on an old car is unknown rather than perfect", () => {
  assert.equal(assessMileage(0, 12, "Fin bil"), "unknown");
  assert.equal(assessMileage(500, 12, "Fin bil"), "suspicious");
});

test("service history modifiers keep unknown neutral", () => {
  assert.equal(serviceHistoryModifier("complete"), 3);
  assert.equal(serviceHistoryModifier("partial"), 1);
  assert.equal(serviceHistoryModifier("unknown"), 0);
  assert.equal(serviceHistoryModifier("missing"), -4);
});

test("cosmetic damage is transparent but does not reduce Deal Score", () => {
  const defect = assessDefects(null, "Några repor och ett dörruppslag redovisas tydligt.");
  assert.equal(defect, "minor_cosmetic");
  assert.equal(defectModifier(defect), 0);
  assert.ok(transparencyScore({
    registrationNumber: true,
    vin: false,
    description: "Några repor och ett dörruppslag redovisas tydligt. Full servicehistorik.",
    serviceHistory: "complete",
    ownerCount: 2,
    defectCategory: defect,
  }) > 50);
});

test("a current engine failure prevents normal ranking", () => {
  const defect = assessDefects("Volvo V60 motorfel", "Startar ej och måste bogseras.");
  assert.equal(defect, "major_defect");
  assert.equal(defectModifier(defect), null);
});

test("a historical repaired engine failure is not quarantined", () => {
  assert.equal(
    assessDefects(null, "Motorn byttes efter motorhaveri 2020 och fungerar perfekt idag."),
    "none",
  );
});

test("A tractor taxonomy is separate from passenger cars", () => {
  assert.equal(classifyVehicleKind({ title: "Audi A5 A traktor", model: "A5", bodyStyle: "coupe" }), "a_tractor");
  assert.equal(classifyVehicleKind({ title: "Audi A5 Sportback", model: "A5", bodyStyle: "hatchback" }), "passenger_car");
});

test("private sellers are neutral and explicit warranty can score higher", () => {
  assert.equal(sellerProtectionScore({ sellerType: "private", title: null, description: null }), 50);
  assert.ok(sellerProtectionScore({ sellerType: "dealer", title: null, description: "12 månaders garanti ingår" }) > 70);
});
