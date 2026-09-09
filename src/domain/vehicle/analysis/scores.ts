export type AnalysisConfidence = "unrated" | "low" | "medium" | "high";

export type ScoreFactorImpact = "positive" | "neutral" | "negative";

/**
 * Identifies which factor this is; the frontend looks up the localized
 * label/explanation for this key in copy.ts rather than storing
 * pre-rendered (language-specific) text here.
 */
export type ScoreFactorKey =
  | "price_vs_market"
  | "vehicle_age"
  | "mileage"
  | "equipment"
  | "listing_transparency"
  | "seller_protection"
  | "service_history_modifier"
  | "known_defects_modifier"
  | "affordability"
  | "condition"
  | "ownership_history";

export interface ScoreFactor {
  key: ScoreFactorKey;
  impact: ScoreFactorImpact;
  /** The underlying 0-100 sub-score this factor is derived from, for visualizing where it falls relative to a typical range. */
  score: number;
  /** Numeric values the frontend's copy function needs to render the explanation (e.g. { percent: 12 } or { ownerCount: 3 }). */
  params: Record<string, number>;
}

interface ExplainableScoreBase {
  confidence: AnalysisConfidence;
  summary: string;
  factors: readonly ScoreFactor[];
}

/**
 * How good the complete car is for the asking price. Deal Score v11 combines
 * price value with vehicle and listing characteristics while keeping the
 * separate market-value estimate as its price anchor.
 *
 * `value` is `null` when the asking price could not be rated: no comparable
 * market value, or the price was quarantined as a monthly rate / deposit /
 * placeholder / typo. A `null` here means *unrated*; it must never be shown as
 * 50, which means "priced about right".
 */
export interface DealScore extends ExplainableScoreBase {
  kind: "deal";
  /** Integer 0-100, or `null` when unrated. */
  value: number | null;
}

/** How reassuring the vehicle itself looks: age, mileage, service history, owners. */
export interface BuyConfidenceScore extends ExplainableScoreBase {
  kind: "buy_confidence";
  /** Integer from 0 (weakest) to 100 (strongest). */
  value: number;
}
