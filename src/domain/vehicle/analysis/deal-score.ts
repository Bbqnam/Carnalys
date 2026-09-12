import type { ServiceHistoryStatus } from "../listing";

/**
 * The scoring core, as pure functions.
 *
 * Every number a Deal Score or Buy Confidence is built from lives here, so it
 * can be reasoned about and unit-tested without a database. The infrastructure
 * layer (`listing-analysis-repository`) only gathers comparables, values the
 * car, and persists the result.
 *
 * ## Product semantics (Deal Score v11)
 *
 * - **Deal Score** — how good the complete car is for the asking price. Market
 *   value remains a separate estimate. Price supplies half of the score; age,
 *   age-relative mileage and ownership, equipment, listing transparency and
 *   seller protection supply the rest. Every component is centred on 50.
 * - **Buy Confidence** — how reassuring the vehicle itself looks: age, mileage,
 *   service history, previous owners. Independent of price.
 * - **Data Confidence** — how much the valuation can be trusted. Carried by the
 *   existing `confidence` field (`low` | `medium` | `high`), plus `unrated`
 *   when no defensible price comparison exists.
 *
 * A Deal Score of ~50 means an average overall deal. It must never mean "we
 * could not work this out" — that case is `unrated`, and `computeDealScore`
 * returns `null`.
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
 * is below market. The v11 curve is deliberately asymmetric and flattens hard
 * beyond a 25 to 30 percent discount, because an extreme apparent bargain is
 * increasingly likely to be a condition or data problem rather than
 * proportionally more valuable.
 */
export function priceValueScore(priceDelta: number) {
  return clampScore(
    interpolateScore(priceDelta, [
      [-0.3, 10],
      [-0.2, 22],
      [-0.1, 36],
      [0, 50],
      [0.05, 57],
      [0.1, 64],
      [0.15, 71],
      [0.2, 77],
      [0.25, 82],
      [0.3, 86],
      [0.4, 89],
      [0.5, 91],
    ]),
  );
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
  mileageScore?: number;
  ageScore?: number;
  ownerScore?: number;
  equipmentScore?: number;
  transparencyScore?: number;
  sellerProtectionScore?: number;
  serviceModifier?: number;
  defectModifier?: number | null;
  eligibleForRanking?: boolean;
}

export interface DealScoreResult {
  /** `null` when there is no defensible price comparison to score. */
  value: number | null;
  priceValueScore: number;
}

/**
 * The v11 blend is written as weighted deviations from 50. That makes an
 * unknown component genuinely neutral rather than accidentally rewarding or
 * punishing the listing. Price evidence is shrunk before it enters the blend;
 * a thin cohort can therefore never manufacture an extreme overall score.
 */
export function computeDealScore(input: DealScoreInput): DealScoreResult {
  const rawPriceScore = priceValueScore(input.priceDelta);
  const pvs = shrinkTowardNeutral(rawPriceScore, input.comparableCount, 6);
  if (
    !input.canComparePrice ||
    input.eligibleForRanking === false ||
    input.defectModifier === null
  ) {
    return { value: null, priceValueScore: Math.round(pvs) };
  }
  const component = (value: number | undefined) => value ?? NEUTRAL_SCORE;
  const raw =
    NEUTRAL_SCORE +
    0.5 * (pvs - NEUTRAL_SCORE) +
    0.12 * (component(input.mileageScore) - NEUTRAL_SCORE) +
    0.12 * (component(input.ageScore) - NEUTRAL_SCORE) +
    0.12 * (component(input.ownerScore) - NEUTRAL_SCORE) +
    0.08 * (component(input.equipmentScore) - NEUTRAL_SCORE) +
    0.03 * (component(input.transparencyScore) - NEUTRAL_SCORE) +
    0.03 * (component(input.sellerProtectionScore) - NEUTRAL_SCORE) +
    (input.serviceModifier ?? 0) +
    (input.defectModifier ?? 0);
  return {
    value: clampScore(raw),
    priceValueScore: Math.round(pvs),
  };
}

const V11_AGE_POINTS = [
  [0, 95], [2, 92], [4, 82], [6, 70], [9, 58], [12, 48],
  [16, 34], [17, 30], [25, 15], [40, 10],
] as const;

const RELATIVE_MILEAGE_POINTS = [
  [0.2, 88], [0.4, 82], [0.7, 70], [1, 55], [1.3, 44],
  [1.7, 30], [2.5, 12], [5, 10],
] as const;

const ABSOLUTE_MILEAGE_POINTS = [
  [0, 95], [30_000, 90], [60_000, 82], [100_000, 70],
  [150_000, 55], [200_000, 40], [300_000, 20], [500_000, 10],
] as const;

const ABSOLUTE_OWNER_POINTS = [
  [1, 90], [2, 76], [3, 62], [4, 50], [5, 38], [8, 18], [12, 10],
] as const;

const RELATIVE_OWNER_POINTS = [
  [0.25, 92], [0.5, 82], [0.8, 68], [1, 55], [1.3, 42],
  [1.8, 25], [3, 10],
] as const;

export interface V11VehicleScoreInput {
  ageYears: number;
  mileageKm: number;
  mileageKnown: boolean;
  ownerCount: number | null;
}

export interface V11VehicleScores {
  ageScore: number;
  mileageScore: number;
  relativeMileageScore: number;
  absoluteMileageScore: number;
  ownerScore: number;
}

/** Swedish passenger cars average roughly 1,200 mil of use per year. */
const EXPECTED_ANNUAL_MILEAGE_KM = 12_000;

export function v11VehicleScores(input: V11VehicleScoreInput): V11VehicleScores {
  const age = Math.max(0, input.ageYears);
  const ageScore = interpolateScore(age, V11_AGE_POINTS);
  const annualisedYears = Math.max(1, age);
  const relativeMileageScore = input.mileageKnown
    ? interpolateScore(
        input.mileageKm / (EXPECTED_ANNUAL_MILEAGE_KM * annualisedYears),
        RELATIVE_MILEAGE_POINTS,
      )
    : NEUTRAL_SCORE;
  const absoluteMileageScore = input.mileageKnown
    ? interpolateScore(Math.max(0, input.mileageKm), ABSOLUTE_MILEAGE_POINTS)
    : NEUTRAL_SCORE;
  const mileageScore = input.mileageKnown
    ? 0.65 * relativeMileageScore + 0.35 * absoluteMileageScore
    : NEUTRAL_SCORE;

  const expectedOwners = 1 + age / 4;
  const ownerScore =
    input.ownerCount === null
      ? 46
      : 0.55 * interpolateScore(input.ownerCount, RELATIVE_OWNER_POINTS.map(
          ([ratio, score]) => [ratio * expectedOwners, score] as const,
        )) + 0.45 * interpolateScore(input.ownerCount, ABSOLUTE_OWNER_POINTS);

  return {
    ageScore: Math.round(ageScore),
    mileageScore: Math.round(mileageScore),
    relativeMileageScore: Math.round(relativeMileageScore),
    absoluteMileageScore: Math.round(absoluteMileageScore),
    ownerScore: Math.round(ownerScore),
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
