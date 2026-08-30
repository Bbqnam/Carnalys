import { minimumPlausibleAskingPrice } from "../pricing";

/**
 * Decides whether an asking price can be compared to the market at all.
 *
 * Roughly 5% of the catalogue advertises something other than the car's price:
 * leasing monthly rates, financing examples, deposits, "från" teaser prices and
 * 1 kr placeholders. None are flagged as such by the source. Three lines of
 * defence, in order:
 *
 *  1. **Absolute bounds** — an age-decayed price floor (a current-year car
 *     under ~25,000 kr is not a car price; an old banger at 4,000 kr still is)
 *     and a hard 3,000,000 kr ceiling.
 *  2. **Structural** — a "price" below a year of its own advertised monthly
 *     cost is the monthly cost. Uses the source's `monthlyCostAmount` where it
 *     exists (Hedin), which is the only structured signal available.
 *  3. **Relative to the car's own adjusted market value:**
 *     - below **35%** of market → automatic quarantine. A real bargain, even a
 *       damaged or urgent one, does not reach two thirds off.
 *     - **35–60%** of market → *verification zone*: allowed only if there is no
 *       leasing/deposit wording, no monthly-payment tell, and a dense cohort
 *       behind the valuation. Even then the result is marked cautious so Data
 *       Confidence drops to `low`.
 *     - above **300%** of market → quarantine (price typo / wrong variant
 *       matched).
 *
 * When quarantined the Deal Score is `null` — *unrated*, never 50.
 */

const MAX_PLAUSIBLE_PRICE = 3_000_000;

const QUARANTINE_SHARE = 0.35;
const VERIFICATION_SHARE = 0.6;
const CEILING_MULTIPLE = 3;
const MONTHLY_MONTHS_STRICT = 12;
const MONTHLY_MONTHS_ZONE = 24;
const DENSE_COHORT = 8;

export type PriceReasonCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PriceQuarantineReason =
  | "below_absolute_minimum"
  | "above_absolute_maximum"
  | "far_below_market"
  | "far_above_market"
  | "monthly_payment_figure"
  | "leasing_or_deposit_wording"
  | "unverified_low_price";

export interface PlausibilityInput {
  askingPrice: number;
  modelYear: number;
  currentYear: number;
  /** Adjusted market value; `null` when the cohort was too thin to value. */
  marketValue: number | null;
  /** Structured monthly cost from the source, when present. */
  monthlyCost?: number | null;
  /** Listing title + description, any case. */
  text?: string | null;
  /** Comparables behind `marketValue`. A thin cohort makes the zone unsafe. */
  comparableCount?: number;
}

export interface PriceAssessment {
  /** `false` → the price cannot be compared; Deal Score is unrated. */
  usable: boolean;
  /** `true` → Deal Score allowed, but Data Confidence must drop to `low`. */
  cautious: boolean;
  reason: PriceQuarantineReason | null;
  /** Stable numeric code, persisted in the price factor's params. */
  reasonCode: PriceReasonCode;
}

const SUSPICIOUS_WORDING =
  /privatleasing|företagsleasing|foretagsleasing|billeasing|\bleasing\b|leasa|hyrköp|hyrkop|avbetalning|delbetalning|kontantinsats|handpenning|per månad|per manad|\/\s?m(å|a)n\b|kr\s?\/\s?m(å|a)n|månadskostnad|manadskostnad|månadspris|manadspris|från\s+[\d][\d\s]{2,}\s?kr/i;

/** Exported for tests and for the ingest-time scan. */
export function hasSuspiciousPriceWording(text: string | null | undefined) {
  return text ? SUSPICIOUS_WORDING.test(text) : false;
}

function quarantine(
  reason: PriceQuarantineReason,
  reasonCode: PriceReasonCode,
): PriceAssessment {
  return { usable: false, cautious: false, reason, reasonCode };
}

export function assessAskingPrice(input: PlausibilityInput): PriceAssessment {
  const { askingPrice, modelYear, currentYear, marketValue, monthlyCost, text } =
    input;
  const comparableCount = input.comparableCount ?? 0;

  if (
    !Number.isFinite(askingPrice) ||
    askingPrice < minimumPlausibleAskingPrice(modelYear, currentYear)
  ) {
    return quarantine("below_absolute_minimum", 1);
  }
  if (askingPrice > MAX_PLAUSIBLE_PRICE) {
    return quarantine("above_absolute_maximum", 2);
  }
  if (
    monthlyCost &&
    monthlyCost > 0 &&
    askingPrice < monthlyCost * MONTHLY_MONTHS_STRICT
  ) {
    return quarantine("monthly_payment_figure", 5);
  }

  if (marketValue && marketValue > 0) {
    const share = askingPrice / marketValue;
    if (share < QUARANTINE_SHARE) return quarantine("far_below_market", 3);
    if (askingPrice > marketValue * CEILING_MULTIPLE) {
      return quarantine("far_above_market", 4);
    }
    if (share < VERIFICATION_SHARE) {
      if (hasSuspiciousPriceWording(text)) {
        return quarantine("leasing_or_deposit_wording", 6);
      }
      if (monthlyCost && monthlyCost > 0 && askingPrice < monthlyCost * MONTHLY_MONTHS_ZONE) {
        return quarantine("monthly_payment_figure", 5);
      }
      if (comparableCount < DENSE_COHORT) {
        return quarantine("unverified_low_price", 7);
      }
      return { usable: true, cautious: true, reason: null, reasonCode: 0 };
    }
  }

  return { usable: true, cautious: false, reason: null, reasonCode: 0 };
}
