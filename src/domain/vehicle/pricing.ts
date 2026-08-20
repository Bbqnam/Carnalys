import type { Money } from "./types";

/** Pricing claimed by the listing source, not a Car Finder valuation. */
export interface ListingPrice {
  askingPrice: Money;
  previousAskingPrice?: Money;
  monthlyCost?: Money;
  vatDeductible?: boolean;
}
