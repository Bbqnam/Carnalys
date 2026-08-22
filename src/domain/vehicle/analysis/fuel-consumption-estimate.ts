import type { BodyStyle, VehicleSpecification } from "../specifications";

/** Extracts the leading number from a scraped consumption string (e.g. "6,2 L/100 km" → 6.2). */
export function parseFuelConsumptionValue(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw.replace(",", ".").match(/[\d.]+/)?.[0] ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
}

const baseLitersPer100kmByFuelType: Partial<Record<VehicleSpecification["powertrain"]["fuelType"], number>> = {
  petrol: 6.8,
  diesel: 5.8,
  ethanol: 8.5,
  self_charging_hybrid: 5.0,
  plug_in_hybrid: 2.0,
};

const bodyStyleAdjustment: Partial<Record<BodyStyle, number>> = {
  suv: 1.4,
  pickup: 1.8,
  van: 1.6,
  minivan: 1.2,
  estate: 0.3,
};

const baselineDisplacementCc = 1_600;
const displacementLitersPerExtraLiter = 0.4;

/**
 * Blocket only reports real fuel/energy consumption on a minority of
 * listings (the rest never had their detail page fetched). This gives a
 * rough L/100km figure from fuel type — refined by body style and engine
 * size when those happen to be known — for display alongside real values,
 * clearly marked as an estimate rather than a scraped fact.
 */
export function estimateFuelConsumptionL100km(
  specification: VehicleSpecification,
): number | undefined {
  const base = baseLitersPer100kmByFuelType[specification.powertrain.fuelType];
  if (base === undefined) return undefined;

  let estimate = base + (bodyStyleAdjustment[specification.bodyStyle] ?? 0);

  const displacementCc = specification.powertrain.engineDisplacementCc;
  if (displacementCc && displacementCc > baselineDisplacementCc) {
    const extraLiters = (displacementCc - baselineDisplacementCc) / 1_000;
    estimate += extraLiters * displacementLitersPerExtraLiter;
  }

  return Math.round(estimate * 10) / 10;
}
