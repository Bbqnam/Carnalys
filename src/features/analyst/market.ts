import {
  sanitizeComparables,
  trimByMedianRatio,
  MIN_COMPARABLES,
  MIN_FIT_COMPARABLES,
  type ValuationComparable,
} from "@/domain/vehicle/analysis/comparable-valuation";
import {
  scoreComparable,
  tierWeight,
  recencyDecayFactor,
  type ComparableTier,
  type SimilarityCandidate,
  type SimilarityTarget,
} from "@/domain/vehicle/analysis/comparable-similarity";

export interface AnalystMarketCandidate {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  bodyStyle: string;
  drivetrain: string | null;
  generation: string | null;
  facelift: boolean | null;
  trim: string | null;
  performanceVariant: string | null;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
  municipality: string;
  sellerType: string;
  synchronizedAt: Date;
  /** How much this candidate should influence the valuation (similarity tier x recency). Set by `constructIndependentCohort`; defaults to 1 for raw input rows. */
  weight?: number;
}

export interface AnalystMarketTarget extends AnalystMarketCandidate {
  monthlyCostAmount: number | null;
  title: string | null;
  description: string | null;
}

// Kept as the public vocabulary (repository.ts and the LLM-facing evidence
// payload key off these labels) even though the underlying selection is now
// a continuous similarity score, not a boolean cascade — "exact" means the
// A-tier alone was enough, "wide_model_fuel" that B had to join it, and so on.
// See comparable-similarity.ts for what actually drives membership now.
export type CohortTier = "exact" | "wide_model_fuel" | "model_fuel" | "make_fallback" | "insufficient";

export interface ConstructedCohort {
  tier: CohortTier;
  definition: string;
  candidates: readonly AnalystMarketCandidate[];
  warnings: readonly string[];
}

function withoutTarget(target: AnalystMarketTarget, candidates: readonly AnalystMarketCandidate[]) {
  return candidates.filter(
    (candidate) => candidate.id !== target.id && candidate.vehicleId !== target.vehicleId,
  );
}

function toSimilarityVehicle(v: AnalystMarketCandidate): SimilarityCandidate {
  return {
    fuelType: v.fuelType,
    transmission: v.transmission,
    drivetrain: v.drivetrain,
    bodyStyle: v.bodyStyle,
    generation: v.generation,
    facelift: v.facelift,
    trim: v.trim,
    performanceVariant: v.performanceVariant,
    modelYear: v.modelYear,
    mileageKm: v.mileageKm,
    sellerType: v.sellerType,
    observedAt: v.synchronizedAt,
  };
}

/** Cross-model same-make fallback carries a flat, low, recency-decayed
 *  weight — generation/trim/drivetrain comparison is meaningless once the
 *  model itself differs, so it is never scored, only bounded by price/year. */
const SEGMENT_FALLBACK_WEIGHT = 0.2;

/**
 * Pure, deterministic cohort selection. Every same-model candidate is scored
 * by similarity (generation, facelift, drivetrain, trim, performance
 * variant, body, year/mileage proximity, seller type, recency — see
 * comparable-similarity.ts) instead of the old fixed boolean tiers, and the
 * cohort widens tier by tier only until there is enough for a real fit — so
 * a facelift, different-trim, or different-drivetrain car can still show up
 * as market context without carrying the same weight as an exact match.
 */
export function constructIndependentCohort(
  target: AnalystMarketTarget,
  sameModel: readonly AnalystMarketCandidate[],
  sameMakeFallback: readonly AnalystMarketCandidate[] = [],
): ConstructedCohort {
  const now = target.synchronizedAt;
  const similarityTarget: SimilarityTarget = toSimilarityVehicle(target);

  const scored = withoutTarget(target, sameModel)
    .map((candidate) => {
      const result = scoreComparable(similarityTarget, toSimilarityVehicle(candidate), now);
      return { candidate, result };
    })
    .filter(({ result }) => !result.hardReject);

  const byTier: Record<ComparableTier, AnalystMarketCandidate[]> = { A: [], B: [], C: [], D: [] };
  for (const { candidate, result } of scored) {
    const weight = tierWeight(result.tier) * recencyDecayFactor(candidate.synchronizedAt, now);
    byTier[result.tier].push({ ...candidate, weight });
  }

  const steps: { tiers: readonly ComparableTier[]; label: CohortTier; definition: string; warning?: string }[] = [
    {
      tiers: ["A"],
      label: "exact",
      definition: "Near-identical comparables: same generation/facelift (when known), drivetrain, fuel and transmission, close model year and mileage; one active advert per physical vehicle.",
    },
    {
      tiers: ["A", "B"],
      label: "wide_model_fuel",
      definition: "Strong comparables widened to include modestly different trim, drivetrain, or year/mileage distance; one active advert per physical vehicle.",
      warning: "The exact cohort was too small, so moderately similar comparables were included at reduced weight.",
    },
    {
      tiers: ["A", "B", "C"],
      label: "model_fuel",
      definition: "Same canonical make/model and fuel, widened to broader market context (facelift/trim/drivetrain differences allowed); one active advert per physical vehicle.",
      warning: "A broad same-model cohort was required; weaker comparables were included but weighted down.",
    },
    {
      tiers: ["A", "B", "C", "D"],
      label: "model_fuel",
      definition: "Same canonical make/model and fuel; every available comparable included, most at low weight; one active advert per physical vehicle.",
      warning: "Only a thin same-model cohort was available; most comparables are weak matches weighted down accordingly.",
    },
  ];

  const totalScored = byTier.A.length + byTier.B.length + byTier.C.length + byTier.D.length;
  let pool: AnalystMarketCandidate[] = [];
  for (const step of steps) {
    pool = step.tiers.flatMap((tier) => byTier[tier]);
    // Stop as soon as there's enough for a real fit, OR widening further
    // couldn't add anything anyway (the wider tiers are simply empty) — a
    // rare car with only 3 same-model listings, all Tier A, should be
    // labelled "exact", not dragged through every step just because 3 < 8.
    if (pool.length >= MIN_FIT_COMPARABLES || pool.length === totalScored || step === steps[steps.length - 1]) {
      if (pool.length >= MIN_COMPARABLES) {
        return { tier: step.label, definition: step.definition, candidates: pool, warnings: step.warning ? [step.warning] : [] };
      }
      break;
    }
  }

  const fallback = withoutTarget(target, sameMakeFallback)
    .filter(
      (candidate) =>
        Math.abs(candidate.modelYear - target.modelYear) <= 5 &&
        candidate.priceAmount >= target.priceAmount * 0.6 &&
        candidate.priceAmount <= target.priceAmount * 1.4,
    )
    .map((candidate) => ({ ...candidate, weight: SEGMENT_FALLBACK_WEIGHT * recencyDecayFactor(candidate.synchronizedAt, now) }));
  if (fallback.length >= MIN_COMPARABLES) {
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
    weight: candidate.weight ?? 1,
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
      weight: candidate.weight ?? 1,
    } satisfies ValuationComparable,
  }));
  const sane = sanitizeComparables(withDomainShape.map((entry) => entry.comparable));
  const saneSet = new Set(sane);
  const nearest = withDomainShape
    .filter((entry) => saneSet.has(entry.comparable))
    .toSorted((left, right) => {
      const weightDiff = (right.candidate.weight ?? 1) - (left.candidate.weight ?? 1);
      if (weightDiff !== 0) return weightDiff;
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

