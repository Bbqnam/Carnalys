import type { Money } from "./types";

/** Pricing claimed by the listing source, not a Carnalysis valuation. */
export interface ListingPrice {
  askingPrice: Money;
  previousAskingPrice?: Money;
  monthlyCost?: Money;
  vatDeductible?: boolean;
}

/**
 * The lowest asking price that can plausibly be the price of the car itself.
 *
 * Roughly 5% of the catalogue advertises something that is not the car's
 * price: leasing ads carrying a monthly rate, and "call for price"
 * placeholders listed at 1 SEK. The marketplace gives no way to identify these
 * directly — `monthlyCost` is null on every row we hold and the descriptions
 * carry no leasing wording — so age-relative price is the only signal
 * available, and it separates them cleanly.
 *
 * For a current-model-year car the placeholders cluster below 10,000 SEK,
 * while only a few dozen genuine listings sit anywhere between 10,000 and
 * 25,000 and the 1st percentile of real listings is around 214,000. The junk
 * is a separate cluster with a wide empty gap above it, not the tail of the
 * real distribution.
 *
 * The floor decays with age until it reaches the absolute minimum, so a
 * genuine old banger at 4,000 SEK still counts as real.
 *
 * This lives in the domain because two independent pipelines depend on it —
 * the market analysis and the stored Deal Score / market value — and they must
 * not drift apart. Before it existed, a 1 SEK 2026 XC60 scored a perfect Deal
 * Score against a 600,000 SEK market value.
 */
export const absoluteMinimumAskingPrice = 3_000;
const newVehiclePriceFloor = 25_000;
const priceFloorDecayPerYear = 2_000;

export function minimumPlausibleAskingPrice(
  modelYear: number,
  currentYear: number,
) {
  return Math.max(
    absoluteMinimumAskingPrice,
    newVehiclePriceFloor - priceFloorDecayPerYear * (currentYear - modelYear),
  );
}

/**
 * SQL for the same rule, for queries that must filter in the database rather
 * than after loading rows. `priceColumn` and `modelYearColumn` are trusted
 * SQL identifiers supplied by callers in this repository — never user input.
 */
export function plausibleAskingPriceSql(
  priceColumn: string,
  modelYearColumn: string,
  currentYear: number,
) {
  return `${priceColumn} >= GREATEST(${absoluteMinimumAskingPrice}, ${newVehiclePriceFloor} - ${priceFloorDecayPerYear} * (${currentYear} - ${modelYearColumn}))`;
}
