import assert from "node:assert/strict";
import test from "node:test";
import { selectReliabilityCandidate } from "@/domain/reliability";

const broad = {
  generation: null,
  fuelType: null,
  transmission: null,
  enginePattern: null,
  modelYearFrom: 2018,
  modelYearTo: 2024,
};

test("reliability matching prefers an exact powertrain profile", () => {
  const exact = {
    ...broad,
    generation: "G01",
    fuelType: "plug_in_hybrid",
    transmission: "automatic",
    enginePattern: "xdrive30e",
  };
  const selected = selectReliabilityCandidate([broad, exact], {
    engineDescription: "xDrive30e 292 hk",
  });

  assert.equal(selected, exact);
});

test("an engine-specific profile is excluded when its engine does not match", () => {
  const diesel = { ...broad, enginePattern: "b47" };
  const selected = selectReliabilityCandidate([diesel, broad], {
    engineDescription: "B48 petrol",
  });

  assert.equal(selected, broad);
});
