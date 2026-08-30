import type { Money } from "../types";
import { minimumPlausibleAskingPrice } from "../pricing";
import {
  estimateFuelConsumptionL100km,
  parseFuelConsumptionValue,
} from "./fuel-consumption-estimate";
import type { OwnershipCostEstimate, OwnershipCostItem } from "./ownership-cost";
import type { VehicleSpecification } from "../specifications";

const annualDistanceKm = 15_000;

// Swedish market averages (kr per litre / kWh / kg), late 2026. Coarse but
// far closer to reality than a flat share of an unrelated total — and
// unlike price, these don't need to be re-estimated per car.
const energyPricePerUnit: Record<VehicleSpecification["powertrain"]["fuelType"], number> = {
  petrol: 18.5,
  diesel: 19.5,
  ethanol: 14,
  electric: 2.5,
  hydrogen: 120,
  plug_in_hybrid: 18.5,
  self_charging_hybrid: 18.5,
  other: 18.5,
};

const electricConsumptionKwhPer100km = 18;

function estimatedConsumption(specification: VehicleSpecification): number {
  if (specification.powertrain.fuelType === "electric") return electricConsumptionKwhPer100km;
  return estimateFuelConsumptionL100km(specification) ?? 6.5;
}

function resolveConsumption(specification: VehicleSpecification) {
  const real = parseFuelConsumptionValue(specification.powertrain.fuelConsumption);
  if (real !== undefined) return { value: real, isReal: true };
  return { value: estimatedConsumption(specification), isReal: false };
}

// CO2 grams/km per unit of L/100km — used only for the tax formula below.
// Hybrids and other combustion-adjacent types use the petrol factor as a
// reasonable approximation; there's no published per-type constant for them.
const co2GramsPerLiter100km: Partial<Record<VehicleSpecification["powertrain"]["fuelType"], number>> = {
  petrol: 23.2,
  diesel: 26.4,
};

const basicVehicleTaxCharge = 360;

/**
 * Sweden's bonus-malus vehicle tax: a CO2-based charge for cars registered
 * within the last 3 model years (2018+), a flatter older-regime charge
 * otherwise, plus a diesel surcharge (fuel tax equalization) in both cases.
 * Electric cars pay only the basic charge.
 */
function annualVehicleTax(
  fuelType: VehicleSpecification["powertrain"]["fuelType"],
  consumptionL100km: number,
  modelYear: number,
  referenceYear: number,
) {
  if (fuelType === "electric") return basicVehicleTaxCharge;

  const co2GramsPerKm =
    consumptionL100km * (co2GramsPerLiter100km[fuelType] ?? co2GramsPerLiter100km.petrol!);
  const isDiesel = fuelType === "diesel";
  const isRecentEnoughForMalus = modelYear >= 2018 && modelYear >= referenceYear - 3;

  if (isRecentEnoughForMalus) {
    const co2Charge =
      co2GramsPerKm <= 75
        ? 0
        : co2GramsPerKm <= 125
          ? (co2GramsPerKm - 75) * 107
          : (125 - 75) * 107 + (co2GramsPerKm - 125) * 132;
    const tax = basicVehicleTaxCharge + co2Charge;
    return isDiesel ? tax + 250 + co2GramsPerKm * 13.52 : tax;
  }

  const co2Charge = Math.max(0, co2GramsPerKm - 111) * 22;
  const standardTax = basicVehicleTaxCharge + co2Charge;
  if (isDiesel && modelYear < 2018) return standardTax * 2.37;
  if (isDiesel) return standardTax + 250 + co2GramsPerKm * 13.52;
  return standardTax;
}

// Two-phase value-retention curve: a steeper first-year drop, then
// geometric decay. Anchored to the car's *current* asking price rather than
// an unknown original purchase price — since retention(age) is the fraction
// of original price remaining, price / retention(age) recovers an implied
// original price, and multiplying back by retention(age + 1) gives next
// year's implied value without ever needing the real original price.
function retention(ageYears: number, isElectric: boolean) {
  const firstYearRetention = isElectric ? 0.75 : 0.8;
  const annualRetention = isElectric ? 0.88 : 0.87;
  if (ageYears <= 0) return 1;
  if (ageYears <= 1) return 1 - (1 - firstYearRetention) * ageYears;
  return firstYearRetention * annualRetention ** (ageYears - 1);
}

function annualDepreciation(askingPrice: number, age: number, isElectric: boolean) {
  const currentRetention = retention(age, isElectric);
  const nextYearRetention = retention(age + 1, isElectric);
  return askingPrice * (1 - nextYearRetention / currentRetention);
}

// Insurance is priced by insurers mainly on risk (power, body/segment) and
// only loosely on value — not linearly on price the way a flat percentage
// implies. A flat base plus a power-based step, with only a capped value
// component, keeps a budget car and an expensive-but-modest car from being
// priced as if risk scaled with price alone.
function annualInsurance(askingPrice: number, horsepowerHp: number | undefined) {
  const base = 5_500;
  const powerSurcharge = horsepowerHp ? Math.max(0, horsepowerHp - 150) * 15 : 0;
  const valueComponent = Math.min(askingPrice, 300_000) * 0.01;
  return base + powerSurcharge + valueComponent;
}

function annualMaintenance(age: number) {
  const base = 4_000;
  const ageComponent = Math.min(age, 15) * 350;
  const mileageComponent = (annualDistanceKm / 1_000) * 60;
  return base + ageComponent + mileageComponent;
}

function money(amount: number): Money {
  return { amount: Math.round(amount), currency: "SEK" };
}

/**
 * Ownership cost depends only on this one car's own price, age, and
 * powertrain — never on other listings — so unlike deal score / market
 * value it's computed live on every read instead of precomputed and
 * batch-refreshed. A formula change here takes effect immediately for
 * every listing, with nothing to backfill.
 */
export function estimateOwnershipCost(
  specification: VehicleSpecification,
  askingPrice: number,
  modelYear: number,
  referenceYear = new Date().getFullYear(),
): OwnershipCostEstimate {
  const age = Math.max(0, referenceYear - modelYear);
  const isElectric = specification.powertrain.fuelType === "electric";
  const consumption = resolveConsumption(specification);

  // Depreciation and insurance are anchored to the asking price, so a listing
  // whose "price" is really a monthly rate or a 1 kr placeholder would produce
  // a nonsensically cheap cost of ownership. When the price is not credible for
  // the car's age, cost it as if it were priced at the plausibility floor and
  // drop the confidence — better a conservative over-estimate than an
  // attractive fiction.
  const plausiblePrice = minimumPlausibleAskingPrice(modelYear, referenceYear);
  const priceIsImplausible = askingPrice < plausiblePrice;
  const costBasisPrice = priceIsImplausible ? plausiblePrice : askingPrice;

  const depreciation = annualDepreciation(costBasisPrice, age, isElectric);
  const energy =
    (annualDistanceKm / 100) *
    consumption.value *
    energyPricePerUnit[specification.powertrain.fuelType];
  const tax = annualVehicleTax(
    specification.powertrain.fuelType,
    consumption.value,
    modelYear,
    referenceYear,
  );
  const insurance = annualInsurance(costBasisPrice, specification.powertrain.powerHp);
  const maintenance = annualMaintenance(age);

  const items: OwnershipCostItem[] = [
    {
      category: "depreciation",
      annualCost: money(depreciation),
      explanation: "Uppskattad värdeminskning per år baserat på pris och ålder.",
    },
    {
      category: "energy",
      annualCost: money(energy),
      explanation: isElectric
        ? "Uppskattad elkostnad baserat på förbrukning och elpris."
        : "Uppskattad drivmedelskostnad baserat på förbrukning och bränslepris.",
    },
    {
      category: "insurance",
      annualCost: money(insurance),
      explanation: "Uppskattad årlig försäkringskostnad baserat på effekt och pris.",
    },
    {
      category: "maintenance",
      annualCost: money(maintenance),
      explanation: "Uppskattat underhåll och service baserat på ålder och miltal.",
    },
    {
      category: "tax",
      annualCost: money(tax),
      explanation: "Beräknad fordonsskatt (bonus malus där tillämpligt).",
    },
  ];

  const totalAnnualCost = items.reduce((sum, item) => sum + item.annualCost.amount, 0);

  return {
    annualCost: { amount: totalAnnualCost, currency: "SEK" },
    estimatedForAnnualDistanceKm: annualDistanceKm,
    confidence:
      priceIsImplausible || !consumption.isReal ? "low" : "medium",
    items,
    assumptions: [
      "1 500 mil per år",
      consumption.isReal ? "Verklig bränsleförbrukning" : "Uppskattad bränsleförbrukning",
    ],
  };
}
