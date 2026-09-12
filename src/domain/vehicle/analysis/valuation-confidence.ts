/**
 * Valuation Confidence — how much Carnalys trusts `marketValueAmount` itself.
 *
 * Deliberately NOT Buy Confidence (`deal-score.ts`), which is about risk in
 * the specific car (age, mileage, service history, ownership count). This is
 * about the *estimate*: how many strong comparables backed it, how tightly
 * they agree, whether the local age/mileage fit could even be computed, and
 * whether the cohort had to fall back to a cross-model segment.
 *
 * Never displayed as false precision: a sparse or scattered cohort must
 * produce a low score even when the point estimate looks clean.
 */

import type { ValuationMethod } from "./comparable-valuation";

export type ValuationConfidenceLabel =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

export interface ValuationConfidenceInput {
  /** Comparable counts by tier, AFTER any sanity/trim filtering. */
  tierACount: number;
  tierBCount: number;
  tierCCount: number;
  tierDCount: number;
  method: ValuationMethod;
  /** `true` when the cohort had to widen past the same model family. */
  usedSegmentFallback: boolean;
  /** (p75 - p25) / median of the comparables actually used; 0 = perfect agreement. */
  priceDispersionRatio: number;
}

export interface ValuationConfidence {
  score: number;
  label: ValuationConfidenceLabel;
}

const COUNT_WEIGHT = 0.4;
const DISPERSION_WEIGHT = 0.35;
const METHOD_WEIGHT = 0.25;

/** Dispersion ratio at/above which agreement is scored as zero. */
const MAX_MEANINGFUL_DISPERSION = 0.5;

function countScore(strongCount: number): number {
  if (strongCount <= 0) return 0;
  // Diminishing returns: the jump from 1 to 5 strong comparables matters far
  // more than the jump from 20 to 24.
  return Math.min(1, Math.log2(strongCount + 1) / Math.log2(21));
}

/**
 * Below 3 strong comparables, "tight dispersion" is barely a measurement —
 * two listings that happen to agree are not evidence the way twelve are.
 * Applied on top of `countScore` so a thin cohort cannot be rescued into
 * "medium" confidence purely by low dispersion or a lucky adjusted fit.
 */
function smallSamplePenalty(strongCount: number): number {
  if (strongCount >= 3) return 1;
  return Math.pow(Math.max(0, strongCount) / 3, 1.5);
}

function dispersionScore(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio < 0) return 0.5;
  return Math.max(0, 1 - ratio / MAX_MEANINGFUL_DISPERSION);
}

function methodScore(method: ValuationMethod): number {
  switch (method) {
    case "adjusted":
      return 1;
    case "raw_median":
      return 0.55;
    case "insufficient":
      return 0;
  }
}

function labelFor(score: number): ValuationConfidenceLabel {
  if (score >= 85) return "very_high";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= 30) return "low";
  return "very_low";
}

export function computeValuationConfidence(
  input: ValuationConfidenceInput,
): ValuationConfidence {
  if (input.method === "insufficient") return { score: 0, label: "very_low" };

  const strongCount = input.tierACount + input.tierBCount;
  const raw =
    COUNT_WEIGHT * countScore(strongCount) +
    DISPERSION_WEIGHT * dispersionScore(input.priceDispersionRatio) +
    METHOD_WEIGHT * methodScore(input.method);

  // A cohort that only exists because we widened past the model family is
  // context, not a confident estimate for *this* car — cap it hard rather
  // than let a large, tight, but wrong-model cohort read as "very high".
  const fallbackMultiplier = input.usedSegmentFallback ? 0.6 : 1;
  const sampleMultiplier = smallSamplePenalty(strongCount);

  const score = Math.round(raw * fallbackMultiplier * sampleMultiplier * 100);
  return { score, label: labelFor(score) };
}
