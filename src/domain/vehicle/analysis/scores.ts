export type AnalysisConfidence = "low" | "medium" | "high";

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
 * How good the asking price is, relative to this car's own age- and
 * mileage-adjusted market value — and nothing else.
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
