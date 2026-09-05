import type { FuelType } from "../specifications";

/**
 * Hand-curated insurance risk multipliers — a rough, illustrative model of
 * how Swedish insurers tend to treat different vehicles and drivers, not a
 * fitted result from measured quotes. We deliberately dropped the
 * measured-quote calibration approach (see docs/INSURANCE_INTELLIGENCE.md):
 * collecting enough real quotes to calibrate a model was too slow to be
 * worth it, and a single-profile dataset couldn't have separated driver
 * effects from vehicle effects anyway.
 *
 * This exists to fix one concrete problem: the base formula in
 * `ownership-cost-estimate.ts` (power + value only) has zero brand signal,
 * so a Tesla and a Mazda at the same price/power come out identically priced
 * to insure — which is exactly backwards from what buyers actually see.
 * These tables are a deliberately coarse correction, not a claim of
 * precision. Expect to retune the numbers by eye over time rather than
 * treat them as final.
 */

type BrandRiskTier = "economy" | "mainstream" | "premium" | "performance";

const TIER_MULTIPLIER: Record<BrandRiskTier, number> = {
  economy: 0.85,
  mainstream: 1.0,
  premium: 1.25,
  performance: 1.6,
};

/** Lowercase brand name -> tier. Anything not listed defaults to "mainstream". */
const BRAND_TIER: Record<string, BrandRiskTier> = {
  dacia: "economy",
  kia: "economy",
  hyundai: "economy",
  suzuki: "economy",
  fiat: "economy",
  citroën: "economy",
  citroen: "economy",
  mitsubishi: "economy",
  seat: "economy",
  skoda: "economy",
  toyota: "economy",
  mazda: "economy",
  nissan: "mainstream",
  peugeot: "mainstream",
  renault: "mainstream",
  opel: "mainstream",
  ford: "mainstream",
  volkswagen: "mainstream",
  subaru: "mainstream",
  cupra: "premium",
  volvo: "premium",
  audi: "premium",
  "mercedes-benz": "premium",
  mercedes: "premium",
  bmw: "premium",
  "land rover": "premium",
  jaguar: "premium",
  lexus: "premium",
  mini: "premium",
  polestar: "premium",
  porsche: "performance",
  tesla: "performance",
};

/**
 * EVs run higher on top of their brand tier — battery/parts repair cost and
 * (for the performance-oriented models common today) higher power all push
 * the same direction. Applied once, independent of brand.
 *
 * Plug-in hybrids get a *larger* surcharge than pure EVs — real quotes
 * checked against this model (5 PHEVs across Toyota/Kia, initially assumed
 * to need no surcharge at all) undershot by 13-58%, averaging roughly 2x
 * under-priced, which 1.5x brings to within ~18% average error. That's a
 * genuinely bigger effect than the pure-EV surcharge, which is plausible: a
 * PHEV keeps the full combustion drivetrain *and* adds a battery/electric
 * one, rather than trading one system for the other. Two of the five
 * (Toyota RAV4, Yaris Cross) remained under-priced even after this fix and
 * two (Toyota Corolla Cross) over-shot — real per-model variance a single
 * fuel-type multiplier can't absorb; treat those as known residual outliers
 * rather than evidence to keep chasing a perfect global fit.
 */
const EV_SURCHARGE_MULTIPLIER = 1.2;
const PHEV_SURCHARGE_MULTIPLIER = 1.5;

function brandTier(make: string): BrandRiskTier {
  return BRAND_TIER[make.trim().toLowerCase()] ?? "mainstream";
}

/** The part of the multiplier that applies to every viewer of a listing — no personal data involved. */
export function brandRiskMultiplier(make: string, fuelType: FuelType): number {
  const tier = TIER_MULTIPLIER[brandTier(make)];
  if (fuelType === "electric") return tier * EV_SURCHARGE_MULTIPLIER;
  if (fuelType === "plug_in_hybrid") return tier * PHEV_SURCHARGE_MULTIPLIER;
  return tier;
}

/**
 * One insurance profile per Carnalys user — set once, applied to every
 * listing they view. Coarse bands only, never personnummer or an exact
 * address (see the `User` model). Every field is independently optional: an
 * unset field just contributes no adjustment rather than blocking the rest.
 */
export interface InsuranceProfileInput {
  ageBand?: string | null;
  licenceYears?: number | null;
  region?: string | null;
}

/** Matches the age bands offered in the settings form — see settings-content.tsx. */
const AGE_BAND_MULTIPLIER: Record<string, number> = {
  "18-24": 1.35,
  "25-29": 1.15,
  "30-39": 1.0,
  "40-49": 0.95,
  "50-64": 0.9,
  "65+": 1.0,
};

function licenceYearsMultiplier(years: number): number {
  if (years < 2) return 1.25;
  if (years < 5) return 1.1;
  if (years < 15) return 1.0;
  return 0.92;
}

/**
 * Sweden's three biggest metro kommuner see noticeably higher theft/claims
 * rates than the rest of the country. Everything else defaults to 1 rather
 * than guessing at a rural discount we have no basis for.
 */
const METRO_KOMMUN = new Set([
  "stockholm",
  "göteborg",
  "goteborg",
  "malmö",
  "malmo",
]);
const METRO_MULTIPLIER = 1.15;

function regionMultiplier(region: string): number {
  return METRO_KOMMUN.has(region.trim().toLowerCase()) ? METRO_MULTIPLIER : 1;
}

/** The personal part of the multiplier — 1 (no adjustment) for any field the user hasn't set. */
export function personalRiskMultiplier(profile?: InsuranceProfileInput | null): number {
  if (!profile) return 1;
  const age = profile.ageBand ? (AGE_BAND_MULTIPLIER[profile.ageBand] ?? 1) : 1;
  const licence =
    profile.licenceYears != null ? licenceYearsMultiplier(profile.licenceYears) : 1;
  const region = profile.region ? regionMultiplier(profile.region) : 1;
  return age * licence * region;
}

/** Combined multiplier applied to the base power/value insurance formula. */
export function insuranceRiskMultiplier(
  make: string,
  fuelType: FuelType,
  profile?: InsuranceProfileInput | null,
): number {
  return brandRiskMultiplier(make, fuelType) * personalRiskMultiplier(profile);
}
