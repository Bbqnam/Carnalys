import type { AnalysisConfidence } from "../vehicle/analysis/scores";
import type { InsuranceEstimateTarget, InsuranceQuoteComparable } from "./types";

/**
 * Comparable-lookup insurance risk estimator.
 *
 * This deliberately mirrors `comparable-valuation.ts`'s philosophy rather than
 * introducing a new one: with a manually-collected dataset in the tens to low
 * hundreds of rows, a fitted regression or gradient-boosted model would have
 * more effective parameters than data points, and would trade away the
 * explainability that matters more here than a marginal RMSE improvement (see
 * docs/INSURANCE_INTELLIGENCE.md). The target is screening — distinguishing
 * ~900 from ~1,500 from ~3,000 SEK/month — not the exact premium.
 *
 * Instead of a single continuous distance metric across heterogeneous
 * attributes, comparables are pooled through the same kind of widening
 * fallback hierarchy already used for `MarketCohort` snapshots: try the
 * narrowest tier with enough observations, then broaden. This keeps every
 * estimate explainable as "N quotes for the same model" or "N quotes for
 * similar vehicles" rather than an opaque weighted distance.
 */

const MIN_COMPARABLES = 3;
const HIGH_CONFIDENCE_COUNT = 6;
const NEAREST_COMPARABLE_LIMIT = 40;

/** How far a comparable's value may sit from the target's before it stops being "similar" in the broadest tier. */
const VALUE_BAND_LOW_RATIO = 0.6;
const VALUE_BAND_HIGH_RATIO = 1.6;

export type InsuranceEstimateTier = "model" | "make_body_fuel" | "body_fuel_value_band";

export interface InsuranceEstimate {
  /** Rounded to the nearest 50 SEK. */
  medianMonthly: number;
  rangeLow: number;
  rangeHigh: number;
  cheapestMonthly: number;
  cheapestInsurer: string;
  comparableCount: number;
  insurerCount: number;
  tier: InsuranceEstimateTier;
  confidence: AnalysisConfidence;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = (sorted.length - 1) / 2;
  return (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2;
}

function roundedToFifty(value: number): number {
  return Math.round(value / 50) * 50;
}

function sameMake(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sameModel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function valueDistance(target: InsuranceEstimateTarget, comparable: InsuranceQuoteComparable) {
  return Math.abs(comparable.vehicleValueAmount - target.vehicleValueAmount);
}

function nearestByValue(
  target: InsuranceEstimateTarget,
  comparables: readonly InsuranceQuoteComparable[],
): InsuranceQuoteComparable[] {
  return [...comparables]
    .sort((a, b) => valueDistance(target, a) - valueDistance(target, b))
    .slice(0, NEAREST_COMPARABLE_LIMIT);
}

function confidenceFor(tier: InsuranceEstimateTier, count: number): AnalysisConfidence {
  if (tier === "model") return count >= HIGH_CONFIDENCE_COUNT ? "high" : "medium";
  if (tier === "make_body_fuel") return count >= HIGH_CONFIDENCE_COUNT ? "medium" : "low";
  return "low";
}

function summarize(
  tier: InsuranceEstimateTier,
  pool: readonly InsuranceQuoteComparable[],
): InsuranceEstimate {
  const premiums = pool.map((c) => c.monthlyPremiumAmount);
  const cheapest = [...pool].sort((a, b) => a.monthlyPremiumAmount - b.monthlyPremiumAmount)[0];
  return {
    medianMonthly: roundedToFifty(median(premiums)),
    rangeLow: roundedToFifty(Math.min(...premiums)),
    rangeHigh: roundedToFifty(Math.max(...premiums)),
    cheapestMonthly: cheapest.monthlyPremiumAmount,
    cheapestInsurer: cheapest.insurer,
    comparableCount: pool.length,
    insurerCount: new Set(pool.map((c) => c.insurer.trim().toLowerCase())).size,
    tier,
    confidence: confidenceFor(tier, pool.length),
  };
}

/**
 * `comparables` should already be a reasonably bounded pool (e.g. every quote
 * for the target's make, fetched by the repository) — this function does the
 * tiering and trimming, not the initial database filtering.
 *
 * Returns `null` when even the broadest tier can't clear `MIN_COMPARABLES`:
 * an explicit "no reliable estimate" is preferred over a guess built from too
 * little data.
 */
export function estimateInsuranceRisk(
  target: InsuranceEstimateTarget,
  comparables: readonly InsuranceQuoteComparable[],
): InsuranceEstimate | null {
  const sameModelPool = comparables.filter(
    (c) => sameMake(c.make, target.make) && sameModel(c.model, target.model),
  );
  if (sameModelPool.length >= MIN_COMPARABLES) {
    return summarize("model", nearestByValue(target, sameModelPool));
  }

  const sameMakeBodyFuelPool = comparables.filter(
    (c) =>
      sameMake(c.make, target.make) &&
      c.bodyStyle === target.bodyStyle &&
      c.fuelType === target.fuelType,
  );
  if (sameMakeBodyFuelPool.length >= MIN_COMPARABLES) {
    return summarize("make_body_fuel", nearestByValue(target, sameMakeBodyFuelPool));
  }

  const valueBandPool = comparables.filter(
    (c) =>
      c.bodyStyle === target.bodyStyle &&
      c.fuelType === target.fuelType &&
      c.vehicleValueAmount >= target.vehicleValueAmount * VALUE_BAND_LOW_RATIO &&
      c.vehicleValueAmount <= target.vehicleValueAmount * VALUE_BAND_HIGH_RATIO,
  );
  if (valueBandPool.length >= MIN_COMPARABLES) {
    return summarize("body_fuel_value_band", nearestByValue(target, valueBandPool));
  }

  return null;
}
