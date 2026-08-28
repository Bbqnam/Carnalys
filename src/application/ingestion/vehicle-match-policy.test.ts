import assert from "node:assert/strict";
import test from "node:test";
import { exactVehicleMatchEvidence } from "./vehicle-match-policy";

test("registration is the preferred exact cross-source identity", () => {
  assert.deepEqual(
    exactVehicleMatchEvidence({ registrationNumber: "ABC123", vin: "VIN123" } as never),
    { method: "exact_registration", confidence: 1 },
  );
});

test("VIN is exact when registration is unavailable", () => {
  assert.deepEqual(exactVehicleMatchEvidence({ vin: "VIN123" } as never), {
    method: "exact_vin",
    confidence: 1,
  });
});

test("similar attributes never silently merge vehicles", () => {
  assert.deepEqual(exactVehicleMatchEvidence({ make: "Volvo", model: "XC60" } as never), {
    method: "source_listing",
    confidence: 0,
  });
});
