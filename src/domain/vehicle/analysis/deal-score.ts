import type { ServiceHistoryStatus } from "../listing";

/**
 * The scoring core, as pure functions.
 *
 * Every number a Deal Score or Buy Confidence is built from lives here, so it
 * can be reasoned about and unit-tested without a database. The infrastructure
 * layer (`listing-analysis-repository`) only gathers comparables, values the
 * car, and persists the result.
 *
 * ## Product semantics (v10)
 *
 * - **Deal Score** — how good the asking price is, and nothing else. It is the
 *   asking price compared to this car's *own* estimated market value, which has
 *   already been adjusted for age and mileage. Age, mileage, fuel, gearbox,
 *   absolute price: none of them enter the Deal Score directly, because they are
 *   already in the market value. A fairly priced car scores ~50 whether it is
 *   old or new, cheap or expensive, high or low mileage.
 * - **Buy Confidence** — how reassuring the vehicle itself looks: age, mileage,
 *   service history, previous owners. Independent of price.
 * - **Data Confidence** — how much the valuation can be trusted. Carried by the
 *   existing `confidence` field (`low` | `medium` | `high`), plus `unrated`
 *   when no defensible price comparison exists.
 *
 * A Deal Score of ~50 means "priced about right". It must never mean "we could
 * not work this out" — that case is `unrated`, and `computeDealScore` returns
 * `null`.
 */

/** "Priced at market", and the midpoint Buy Confidence falls back to. */
export const NEUTRAL_SCORE = 50;

/**
 * Deal Score and Buy Confidence never render below 10 or above 95: the data
 * behind them (advertised prices, scraped specs) does not support the certainty
 * that 0 or 100 would imply.
 */
export function clampScore(value: number) {
  return Math.max(10, Math.min(95, Math.round(value)));
}

/**
 * Piecewise-linear lookup. `points` is `[input, score]` pairs in ascending
 * input order; values between points are interpolated, values past either end
 * clamp to that end.
 */
export function interpolateScore(
  value: number,
  points: readonly (readonly [number, number])[],
) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [upperValue, upperScore] = points[index];
    const [lowerValue, lowerScore] = points[index - 1];
    if (value <= upperValue) {
      const ratio = (value - lowerValue) / (upperValue - lowerValue);
      return lowerScore + (upperScore - lowerScore) * ratio;
    }
  }
  return points.at(-1)?.[1] ?? 10;
}

const AGE_SCORE_POINTS = [
  [0, 100], [1, 100], [3, 92], [5, 82], [8, 68],
  [12, 50], [18, 30], [25, 15], [40, 10],
] as const;

const MILEAGE_SCORE_POINTS = [
  [0, 100], [30_000, 92], [60_000, 80], [100_000, 65],
  [150_000, 45], [200_000, 28], [300_000, 10], [500_000, 10],
] as const;

const OWNER_SCORE_POINTS = [
  [1, 100], [2, 80], [3, 60], [4, 45], [5, 30], [8, 15],
] as const;

/**
 * Documented service history is the strongest "sound car to own" signal after
 * mileage. `unknown` scores well below neutral — a listing that does not
 * mention service history usually does not have much of one to mention — and
 * must never behave like `complete`.
 */
const SERVICE_HISTORY_SCORE: Record<ServiceHistoryStatus, number> = {
  complete: 100,
  partial: 62,
  missing: 25,
  unknown: 40,
};

/**
 * Owner-count sub-score. An **unknown** owner count is not treated as a known
 * good one: it scores a little under the three-owner mark rather than at the
 * two-owner mark the raw `?? 2` used to give it.
 */
const UNKNOWN_OWNER_SCORE = 45;

export interface ConditionInputs {
  ageYears: number;
  mileageKm: number;
  /** `null` when the listing does not state it. */
  ownerCount: number | null;
  serviceHistory: ServiceHistoryStatus;
}

export interface ConditionScores {
  ageScore: number;
  mileageScore: number;
  ownerScore: number;
  serviceHistoryScore: number;
  hasOwnerData: boolean;
  hasServiceHistory: boolean;
}

export function conditionScores(inputs: ConditionInputs): ConditionScores {
  return {
    ageScore: interpolateScore(Math.max(0, inputs.ageYears), AGE_SCORE_POINTS),
    mileageScore: interpolateScore(
      Math.max(0, inputs.mileageKm),
      MILEAGE_SCORE_POINTS,
    ),
    ownerScore:
      inputs.ownerCount === null
        ? UNKNOWN_OWNER_SCORE
        : interpolateScore(inputs.ownerCount, OWNER_SCORE_POINTS),
    serviceHistoryScore: SERVICE_HISTORY_SCORE[inputs.serviceHistory],
    hasOwnerData: inputs.ownerCount !== null,
    hasServiceHistory: inputs.serviceHistory !== "unknown",
  };
}

/**
 * Price attractiveness on a 0-100 scale. `priceDelta` is
 * `(marketValue - askingPrice) / marketValue`: positive means the asking price
 * is below market. 50 = priced at market; roughly 1.4 points per percent, so
 * the curve reads (validated against a 2,600-listing sample):
 *
 *   at market   → ~50      10% below → ~63      20% below → ~73      30% below → ~85
 *               10% above  → ~38      20% above → ~26      30% above → ~15
 *
 * The upside is the shallower side on purpose — a headline bargain is more
 * often a data problem than a real one.
 */
export function priceValueScore(priceDelta: number) {
  return clampScore(NEUTRAL_SCORE + priceDelta * 140);
}

/**
 * Pulls a raw score toward 50 in proportion to how few comparables it rests on,
 * by the factor `n / (n + k)`. With `k = 8`: 4 comparables keep a third of the
 * distance from 50, 16 keep two thirds, 40 keep five sixths.
 */
export function shrinkTowardNeutral(
  score: number,
  comparableCount: number,
  k = 8,
) {
  const keep = comparableCount / (comparableCount + k);
  return NEUTRAL_SCORE + (score - NEUTRAL_SCORE) * keep;
}

export interface DealScoreInput {
  priceDelta: number;
  /**
   * False when the asking price could not be read or could not be compared to a
   * market value. The Deal Score is then `null` — unrated, not 50.
   */
  canComparePrice: boolean;
  comparableCount: number;
}

export interface DealScoreResult {
  /** `null` when there is no defensible price comparison to score. */
  value: number | null;
  priceValueScore: number;
}

/**
 * Philosophy A: the Deal Score *is* the price-vs-market comparison, shrunk
 * toward neutral when the comparison is thin. No age, mileage, gearbox, fuel or
 * absolute-price term — those are already in the market value the delta is
 * measured against, and adding them here would double-count.
 */
export function computeDealScore(input: DealScoreInput): DealScoreResult {
  const pvs = priceValueScore(input.priceDelta);
  if (!input.canComparePrice) return { value: null, priceValueScore: pvs };
  return {
    value: clampScore(shrinkTowardNeutral(pvs, input.comparableCount)),
    priceValueScore: pvs,
  };
}

export interface BuyConfidenceInput {
  ageScore: number;
  mileageScore: number;
  ownerScore: number;
  serviceHistoryScore: number;
  hasOwnerData: boolean;
  hasServiceHistory: boolean;
}

/**
 * Weighted blend of the four condition signals. A listing that volunteers
 * *neither* owner count nor service history gets a small extra deduction — not
 * for either field individually (each already scores below neutral when
 * unknown), but because a listing that states so little about itself is, in
 * aggregate, a slightly weaker proposition.
 */
export function computeBuyConfidence(input: BuyConfidenceInput) {
  const raw =
    input.ageScore * 0.34 +
    input.mileageScore * 0.3 +
    input.serviceHistoryScore * 0.2 +
    input.ownerScore * 0.16;
  const thinListing = !input.hasOwnerData && !input.hasServiceHistory ? 4 : 0;
  return clampScore(raw - thinListing);
}
