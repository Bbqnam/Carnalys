/**
 * Target-specific market value from a cohort of comparable listings.
 *
 * ## Method (chosen by benchmark, not by taste)
 *
 * Five candidates were run against 1,500 real cohorts with no ground-truth sale
 * prices, scored on held-out prediction error, bootstrap stability,
 * monotonicity, band-boundary continuity, coverage and new/high-mileage sanity:
 *
 *   - raw nearest-40 median            LOO err 10.2%   — the old behaviour
 *   - **local OLS, median of adjusted**  LOO err  7.4%   ← chosen
 *   - local OLS, point prediction       LOO err  7.5%
 *   - year × mileage-band median        LOO err  9.2%   + 3.5% monotonicity
 *                                                          violations, up to 23%
 *                                                          jumps at band edges
 *   - hybrid of the two                 LOO err  7.9%
 *
 * The local regression wins on every axis that matters and, unlike a band
 * median, is continuous in mileage and monotone by construction. A car with
 * unusually low mileage for its cohort therefore gets a genuinely higher
 * valuation (and a fair asking price still scores ~50), which is the whole
 * point of "what should *this* car cost".
 *
 * ## Shape
 *
 * 1. Sanity-bound the cohort (absolute price / mileage limits).
 * 2. Keep the 40 closest comparables (model-year then mileage distance).
 * 3. Trim anything below 0.4x or above 2.5x the cohort median price.
 * 4. Fit `price ~ ageYears + mileageKm` by centred least squares.
 *    - If both slopes have the expected (negative) sign and there are enough
 *      points, shift every comparable to the target's age and mileage and take
 *      the median of the shifted prices.
 *    - Otherwise the cohort cannot carry the trade-off: fall back to the plain
 *      trimmed median and report `method: "raw_median"` so Data Confidence can
 *      be lowered.
 * 5. Bound the result to 0.5x..1.6x of the plain trimmed median, so a thin or
 *    skewed fit can shade the naive number but never replace it with an absurd
 *    one — while still letting a genuinely high-mileage car be valued well
 *    below the cohort it sits at the edge of.
 *
 * This is deliberately *not* the same model as the `/analysis` page: that one
 * fits one hedonic regression across the whole catalogue to describe market
 * relationships; this one values a single car from its local neighbourhood.
 * They share the plausibility filter and the "median, never mean" principle,
 * and nothing else needs to be shared.
 */

/** Absolute limits — a row outside these is a data error, not a comparable. */
const MIN_PLAUSIBLE_PRICE = 3_000;
const MAX_PLAUSIBLE_PRICE = 3_000_000;
const MAX_PLAUSIBLE_MILEAGE_KM = 1_000_000;

const NEAREST_COMPARABLE_LIMIT = 40;
/** Exported so cohort-widening logic upstream (repository layer) uses the same floor. */
export const MIN_COMPARABLES = 3;
export const MIN_FIT_COMPARABLES = 8;

const TRIM_LOW_RATIO = 0.4;
const TRIM_HIGH_RATIO = 2.5;

/** How far a single shifted comparable may move from its own asking price. */
const PER_COMPARABLE_SHIFT_FLOOR = 0.5;
const PER_COMPARABLE_SHIFT_CEIL = 1.6;

/** How far the adjusted estimate may sit from the plain trimmed median. */
const MEDIAN_CLAMP_FLOOR = 0.5;
const MEDIAN_CLAMP_CEIL = 1.6;

export interface ValuationComparable {
  priceAmount: number;
  ageYears: number;
  mileageKm: number;
  /**
   * How much this comparable should influence the estimate, from the
   * similarity/tier/recency model (see `comparable-similarity.ts`). Defaults
   * to 1 (uniform) so every existing caller and test is unaffected.
   */
  weight?: number;
}

export interface ValuationTarget {
  ageYears: number;
  mileageKm: number;
}

export type ValuationMethod = "adjusted" | "raw_median" | "insufficient";

export interface Valuation {
  /** Rounded to the nearest 1,000; `null` when the cohort is too thin. */
  marketValue: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  /** Comparables that actually fed the estimate (after sanity + trim + nearest). */
  comparableCount: number;
  method: ValuationMethod;
  /** SEK a model year *newer* is worth here; only when `method === "adjusted"`. */
  perModelYear?: number;
  /** SEK 1,000 km *less* is worth here; only when `method === "adjusted"`. */
  perThousandKm?: number;
}

function median(sortedOrNot: readonly number[]) {
  const s = [...sortedOrNot].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)] + s[Math.ceil(mid)]) / 2;
}

/**
 * Weighted percentile by cumulative weight (linear interpolation between the
 * two values straddling the target). With uniform weight 1 this coincides
 * with `percentile` to within one sort position — a difference far inside
 * the noise of any real cohort — while a low-weight comparable (a weak tier,
 * or an old observation) genuinely contributes less to where the line falls,
 * rather than counting as a full vote.
 */
export function weightedPercentile(
  values: readonly { value: number; weight: number }[],
  fraction: number,
) {
  const s = [...values].filter((v) => v.weight > 0).sort((a, b) => a.value - b.value);
  if (s.length === 0) return NaN;
  const totalWeight = s.reduce((sum, v) => sum + v.weight, 0);
  if (!(totalWeight > 0)) return median(s.map((v) => v.value));

  const target = fraction * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < s.length; i++) {
    const previousCumulative = cumulative;
    cumulative += s[i].weight;
    if (cumulative >= target) {
      if (i === 0) return s[i].value;
      const previous = s[i - 1];
      const t = (target - previousCumulative) / (cumulative - previousCumulative);
      return previous.value + t * (s[i].value - previous.value);
    }
  }
  return s[s.length - 1].value;
}

export function weightedMedian(values: readonly { value: number; weight: number }[]) {
  return weightedPercentile(values, 0.5);
}

function roundedThousands(value: number) {
  return Math.max(1_000, Math.round(value / 1_000) * 1_000);
}

function closeness(target: ValuationTarget, comparable: ValuationComparable) {
  return (
    Math.abs(comparable.ageYears - target.ageYears) * 60_000 +
    Math.abs(comparable.mileageKm - target.mileageKm)
  );
}

/** Model-year spread below this makes the age slope noise rather than signal. */
const MIN_AGE_SPREAD_FOR_AGE_TERM = 2;

/**
 * Least-squares slopes of `price ~ ageYears + mileageKm` from a centred 2x2
 * normal-equations solve (centring keeps the system well-conditioned though
 * price and mileage are both ~10^5).
 *
 * When the cohort barely spans two model years — common for near-new cars — the
 * age slope is meaningless, so the fit drops to `price ~ mileageKm` alone and
 * reports `bAge = 0`. `null` means the system is degenerate (no mileage spread,
 * or too few points).
 */
export function fitAgeMileageSlopes(comparables: readonly ValuationComparable[]) {
  const n = comparables.length;
  if (n < MIN_FIT_COMPARABLES) return null;

  const weights = comparables.map((c) => c.weight ?? 1);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!(totalWeight > 0)) return null;

  const meanAge = comparables.reduce((s, c, i) => s + weights[i] * c.ageYears, 0) / totalWeight;
  const meanMileage = comparables.reduce((s, c, i) => s + weights[i] * c.mileageKm, 0) / totalWeight;
  const meanPrice = comparables.reduce((s, c, i) => s + weights[i] * c.priceAmount, 0) / totalWeight;

  let sAgeAge = 0;
  let sMileMile = 0;
  let sAgeMile = 0;
  let sAgePrice = 0;
  let sMilePrice = 0;
  comparables.forEach((c, i) => {
    const w = weights[i];
    const a = c.ageYears - meanAge;
    const m = c.mileageKm - meanMileage;
    const p = c.priceAmount - meanPrice;
    sAgeAge += w * a * a;
    sMileMile += w * m * m;
    sAgeMile += w * a * m;
    sAgePrice += w * a * p;
    sMilePrice += w * m * p;
  });

  if (!Number.isFinite(sMileMile) || sMileMile < 1e-3) return null;

  const ages = comparables.map((c) => c.ageYears);
  const ageSpread = Math.max(...ages) - Math.min(...ages);
  if (ageSpread < MIN_AGE_SPREAD_FOR_AGE_TERM) {
    return { bAge: 0, bMileage: sMilePrice / sMileMile };
  }

  const determinant = sAgeAge * sMileMile - sAgeMile * sAgeMile;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-3) return null;

  const bAge = (sMileMile * sAgePrice - sAgeMile * sMilePrice) / determinant;
  const bMileage = (-sAgeMile * sAgePrice + sAgeAge * sMilePrice) / determinant;
  if (!Number.isFinite(bAge) || !Number.isFinite(bMileage)) return null;

  return { bAge, bMileage };
}

export function sanitizeComparables(comparables: readonly ValuationComparable[]) {
  return comparables.filter(
    (c) =>
      Number.isFinite(c.priceAmount) &&
      Number.isFinite(c.mileageKm) &&
      Number.isFinite(c.ageYears) &&
      c.priceAmount >= MIN_PLAUSIBLE_PRICE &&
      c.priceAmount <= MAX_PLAUSIBLE_PRICE &&
      c.mileageKm >= 0 &&
      c.mileageKm <= MAX_PLAUSIBLE_MILEAGE_KM,
  );
}

export function trimByMedianRatio(comparables: readonly ValuationComparable[]) {
  if (comparables.length < 4) return [...comparables];
  const mid = median(comparables.map((c) => c.priceAmount));
  return comparables.filter(
    (c) =>
      c.priceAmount >= mid * TRIM_LOW_RATIO &&
      c.priceAmount <= mid * TRIM_HIGH_RATIO,
  );
}

/**
 * `comparables` is the tier cohort for one target (already excludes the target
 * itself). Order does not matter.
 */
export function valueVehicle(
  target: ValuationTarget,
  comparables: readonly ValuationComparable[],
): Valuation {
  const insufficient: Valuation = {
    marketValue: null,
    rangeLow: null,
    rangeHigh: null,
    comparableCount: 0,
    method: "insufficient",
  };

  const sane = sanitizeComparables(comparables);
  if (sane.length < MIN_COMPARABLES) return insufficient;

  // Higher-weight comparables (better similarity tier, more recent) win a
  // place in the pool first; age/mileage closeness only breaks ties within a
  // weight band. With every weight equal (the default) this is exactly the
  // old closeness-only ordering.
  const nearest = [...sane]
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1) || closeness(target, a) - closeness(target, b))
    .slice(0, NEAREST_COMPARABLE_LIMIT);

  const trimmed = trimByMedianRatio(nearest);
  if (trimmed.length < MIN_COMPARABLES) return insufficient;

  const prices = trimmed.map((c) => c.priceAmount);
  const plainMedian = median(prices);
  const clampLow = plainMedian * MEDIAN_CLAMP_FLOOR;
  const clampHigh = plainMedian * MEDIAN_CLAMP_CEIL;
  const clamp = (v: number) => Math.min(Math.max(v, clampLow), clampHigh);

  const slopes = fitAgeMileageSlopes(trimmed);
  const canAdjust =
    slopes !== null && slopes.bAge <= 0 && slopes.bMileage < 0;

  if (canAdjust) {
    const { bAge, bMileage } = slopes;
    const shifted = trimmed.map((c) => {
      const raw =
        c.priceAmount +
        bAge * (target.ageYears - c.ageYears) +
        bMileage * (target.mileageKm - c.mileageKm);
      const value = Math.min(
        Math.max(raw, c.priceAmount * PER_COMPARABLE_SHIFT_FLOOR),
        c.priceAmount * PER_COMPARABLE_SHIFT_CEIL,
      );
      return { value, weight: c.weight ?? 1 };
    });
    return {
      marketValue: roundedThousands(clamp(weightedMedian(shifted))),
      rangeLow: roundedThousands(clamp(weightedPercentile(shifted, 0.25))),
      rangeHigh: roundedThousands(clamp(weightedPercentile(shifted, 0.75))),
      comparableCount: trimmed.length,
      method: "adjusted",
      perModelYear: Math.round(-bAge),
      perThousandKm: Math.round(bMileage * 1_000),
    };
  }

  const weightedPrices = trimmed.map((c) => ({ value: c.priceAmount, weight: c.weight ?? 1 }));
  return {
    marketValue: roundedThousands(weightedMedian(weightedPrices)),
    rangeLow: roundedThousands(weightedPercentile(weightedPrices, 0.25)),
    rangeHigh: roundedThousands(weightedPercentile(weightedPrices, 0.75)),
    comparableCount: trimmed.length,
    method: "raw_median",
  };
}
