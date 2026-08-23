/**
 * The Analysis page's colour scales.
 *
 * Three families, one job each — model year (sequential), asking price
 * (sequential), and buying conditions (diverging). The actual hex steps live
 * in `globals.css` as `--viz-*` custom properties so both themes resolve at
 * runtime; this module only decides which step a value lands on.
 *
 * Both sequential ramps are quantised into five steps rather than interpolated
 * continuously. Stepped colour is easier to compare across a grid — a reader
 * can tell "two bands apart" at a glance, where a continuous gradient only
 * says "somewhat darker" — and it keeps the rendered colours to exactly the
 * five that were validated for lightness spacing and contrast.
 */

export const rampSteps = 5;

function stepIndex(ratio: number) {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(rampSteps - 1, Math.floor(ratio * rampSteps)));
}

/** Model year → one of the five `--viz-year-*` steps. Higher step = newer. */
export function modelYearColor(
  modelYear: number,
  oldest: number,
  newest: number,
) {
  const span = Math.max(1, newest - oldest);
  return `var(--viz-year-${stepIndex((modelYear - oldest) / span) + 1})`;
}

/**
 * Splits values into five bands of roughly equal population rather than five
 * equal price intervals.
 *
 * Used-car prices across a mixed selection are heavily skewed — a single band
 * of collector-grade classics would otherwise take the top of a linear scale
 * and flatten every ordinary cell into the same two shades. Quantile bands
 * keep the whole ramp in use; the legend shows the real price boundaries so
 * the uneven widths stay visible rather than hidden.
 */
export function quantileThresholds(values: readonly number[]) {
  const sorted = [...values].toSorted((left, right) => left - right);
  if (sorted.length === 0) return [];

  return Array.from({ length: rampSteps - 1 }, (_, index) => {
    const position = ((index + 1) / rampSteps) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  });
}

/** Asking price → one of the five `--viz-price-*` steps. Higher step = pricier. */
export function priceColor(price: number, thresholds: readonly number[]) {
  const band = thresholds.findIndex((threshold) => price <= threshold);
  return `var(--viz-price-${(band === -1 ? rampSteps - 1 : band) + 1})`;
}
