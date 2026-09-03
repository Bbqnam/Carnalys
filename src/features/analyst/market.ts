import {
  sanitizeComparables,
  trimByMedianRatio,
  type ValuationComparable,
} from "@/domain/vehicle/analysis/comparable-valuation";

export interface AnalystMarketCandidate {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  bodyStyle: string;
  performanceVariant: string | null;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
  municipality: string;
  synchronizedAt: Date;
}

export interface AnalystMarketTarget extends AnalystMarketCandidate {
  monthlyCostAmount: number | null;
  title: string | null;
  description: string | null;
}

export type CohortTier = "exact" | "wide_model_fuel" | "model_fuel" | "make_fallback" | "insufficient";

export interface ConstructedCohort {
  tier: CohortTier;
  definition: string;
  candidates: readonly AnalystMarketCandidate[];
  warnings: readonly string[];
}

function bodyMatches(left: string, right: string) {
  return left === "other" || right === "other" || left === right;
}

function performanceMatches(target: string | null, candidate: string | null) {
  return !target || candidate === target;
}

function withoutTarget(target: AnalystMarketTarget, candidates: readonly AnalystMarketCandidate[]) {
  return candidates.filter(
    (candidate) => candidate.id !== target.id && candidate.vehicleId !== target.vehicleId,
  );
}

/** Pure, deterministic cohort selection mirroring the stored-analysis tiers. */
export function constructIndependentCohort(
  target: AnalystMarketTarget,
  sameModel: readonly AnalystMarketCandidate[],
  sameMakeFallback: readonly AnalystMarketCandidate[] = [],
): ConstructedCohort {
  const base = withoutTarget(target, sameModel);
  const exact = base.filter(
    (candidate) =>
      candidate.fuelType === target.fuelType &&
      candidate.transmission === target.transmission &&
      bodyMatches(candidate.bodyStyle, target.bodyStyle) &&
      performanceMatches(target.performanceVariant, candidate.performanceVariant) &&
      Math.abs(candidate.modelYear - target.modelYear) <= 3 &&
      Math.abs(candidate.mileageKm - target.mileageKm) <= 120_000,
  );
  if (exact.length >= 3) {
    return {
      tier: "exact",
      definition: "Same canonical make/model and fuel, matching transmission and known body/performance variant, within ±3 model years and ±120,000 km; one active advert per physical vehicle.",
      candidates: exact,
      warnings: [],
    };
  }

  const wide = base.filter(
    (candidate) =>
      candidate.fuelType === target.fuelType &&
      bodyMatches(candidate.bodyStyle, target.bodyStyle) &&
      performanceMatches(target.performanceVariant, candidate.performanceVariant) &&
      Math.abs(candidate.modelYear - target.modelYear) <= 8,
  );
  if (wide.length >= 3) {
    return {
      tier: "wide_model_fuel",
      definition: "Same canonical make/model and fuel with compatible known body/performance variant, within ±8 model years; transmission widened; one active advert per physical vehicle.",
      candidates: wide,
      warnings: ["The exact cohort was too small, so transmission and mileage bounds were widened."],
    };
  }

  const sameFuel = base.filter(
    (candidate) =>
      candidate.fuelType === target.fuelType &&
      Math.abs(candidate.modelYear - target.modelYear) <= 8,
  );
  if (sameFuel.length >= 3) {
    return {
      tier: "model_fuel",
      definition: "Same canonical make/model and fuel within ±8 model years; body, transmission, and performance variant widened; one active advert per physical vehicle.",
      candidates: sameFuel,
      warnings: ["A broad same-model fuel cohort was required; comparisons may mix body styles, transmissions, or trims."],
    };
  }

  const fallback = withoutTarget(target, sameMakeFallback).filter(
    (candidate) =>
      Math.abs(candidate.modelYear - target.modelYear) <= 5 &&
      candidate.priceAmount >= target.priceAmount * 0.6 &&
      candidate.priceAmount <= target.priceAmount * 1.4,
  );
  if (fallback.length >= 3) {
    return {
      tier: "make_fallback",
      definition: "Same make within ±5 model years and 60–140% of the target asking price; one active advert per physical vehicle.",
      candidates: fallback,
      warnings: ["Only a broad same-make fallback cohort was available; treat the valuation as low confidence."],
    };
  }

  return {
    tier: "insufficient",
    definition: "No cohort reached the minimum of three plausible, representative active listings.",
    candidates: [],
    warnings: ["There is not enough comparable inventory for a defensible market claim."],
  };
}

export function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

export function valuationComparables(candidates: readonly AnalystMarketCandidate[], currentYear: number) {
  return candidates.map((candidate) => ({
    priceAmount: candidate.priceAmount,
    ageYears: currentYear - candidate.modelYear,
    mileageKm: candidate.mileageKm,
  })) satisfies ValuationComparable[];
}

export function closestValuationCandidates(
  target: AnalystMarketTarget,
  candidates: readonly AnalystMarketCandidate[],
) {
  const currentYear = new Date().getFullYear();
  const withDomainShape = candidates.map((candidate) => ({
    candidate,
    comparable: {
      priceAmount: candidate.priceAmount,
      ageYears: currentYear - candidate.modelYear,
      mileageKm: candidate.mileageKm,
    } satisfies ValuationComparable,
  }));
  const sane = sanitizeComparables(withDomainShape.map((entry) => entry.comparable));
  const saneSet = new Set(sane);
  const nearest = withDomainShape
    .filter((entry) => saneSet.has(entry.comparable))
    .toSorted((left, right) => {
      const leftDistance = Math.abs(left.candidate.modelYear - target.modelYear) * 60_000
        + Math.abs(left.candidate.mileageKm - target.mileageKm);
      const rightDistance = Math.abs(right.candidate.modelYear - target.modelYear) * 60_000
        + Math.abs(right.candidate.mileageKm - target.mileageKm);
      return leftDistance - rightDistance || left.candidate.id.localeCompare(right.candidate.id);
    })
    .slice(0, 40);
  const trimmed = trimByMedianRatio(nearest.map((entry) => entry.comparable));
  const trimmedSet = new Set(trimmed);
  return nearest.filter((entry) => trimmedSet.has(entry.comparable)).map((entry) => entry.candidate);
}

