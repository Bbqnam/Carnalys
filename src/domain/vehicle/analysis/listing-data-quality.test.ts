import assert from "node:assert/strict";
import test from "node:test";
import { classifyPowertrain } from "../taxonomy/powertrain-classification";
import { assessListingDataQuality, type ListingQualityInput } from "./listing-data-quality";

test("classifies BEV, PHEV, HEV, MHEV, diesel and petrol without model-specific rules", () => {
  assert.equal(classifyPowertrain({ fuelType: "electric", text: "Elbil" }).type, "bev");
  assert.equal(classifyPowertrain({ fuelType: "petrol", text: "Plug-in hybrid" }).type, "phev");
  assert.equal(classifyPowertrain({ fuelType: "self_charging_hybrid", text: "Full hybrid" }).type, "hev");
  assert.equal(classifyPowertrain({ fuelType: "petrol", text: "48V mild hybrid" }).type, "mhev");
  assert.equal(classifyPowertrain({ fuelType: "diesel", text: "" }).type, "combustion");
  assert.equal(classifyPowertrain({ fuelType: "petrol", text: "" }).type, "combustion");
});

test("an impossible structured/text powertrain conflict is explicit", () => {
  const result = classifyPowertrain({ fuelType: "electric", text: "Plug-in hybrid" });
  assert.equal(result.type, "phev");
  assert.equal(result.conflict, true);
});

const base: ListingQualityInput = {
  priceAmount: 229_000,
  mileageKm: 82_000,
  modelYear: 2021,
  make: "Kia",
  model: "Ceed",
  title: "Kia Ceed Sportswagon",
  fuelType: "plug_in_hybrid",
  powertrainType: "phev",
  powertrainConflict: false,
  bodyStyle: "estate",
  transmission: "automatic",
  drivetrain: "front_wheel_drive",
  horsepower: 141,
  generation: "Mk3",
  sellerType: "dealer",
  sellerName: "Example Bil",
  currentYear: 2026,
};

test("a plausible listing remains valuation eligible", () => {
  const quality = assessListingDataQuality(base);
  assert.equal(quality.status, "valid");
  assert.equal(quality.valuationEligible, true);
});

test("leasing, VAT-exclusive and implausible mileage records are quarantined with reason codes", () => {
  const quality = assessListingDataQuality({
    ...base,
    priceAmount: 4_995,
    mileageKm: 200,
    description: "Privatleasing 4 995 kr/mån, pris exkl. moms",
    modelYear: 2010,
  });
  assert.equal(quality.status, "rejected");
  assert.equal(quality.valuationEligible, false);
  assert.ok(quality.reasonCodes.includes("LEASE_OR_MONTHLY_PRICE"));
  assert.ok(quality.reasonCodes.includes("VAT_EXCLUSIVE_PRICE"));
  assert.ok(quality.reasonCodes.includes("MILEAGE_IMPLAUSIBLE_FOR_AGE"));
});

test("missing optional classification lowers quality without inventing data", () => {
  const quality = assessListingDataQuality({
    ...base,
    fuelType: "other",
    powertrainType: "unknown",
    bodyStyle: "other",
    transmission: "other",
    drivetrain: undefined,
    generation: null,
  });
  assert.equal(quality.status, "warning");
  assert.equal(quality.valuationEligible, true);
});
