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

interface ExplainableScore {
  /** Integer from 0 (weakest) to 100 (strongest). */
  value: number;
  confidence: AnalysisConfidence;
  summary: string;
  factors: readonly ScoreFactor[];
}

/** Price attractiveness relative to the current market. */
export interface DealScore extends ExplainableScore {
  kind: "deal";
}

/** Overall purchase quality, including ownership experience and risk. */
export interface BuyConfidenceScore extends ExplainableScore {
  kind: "buy_confidence";
}
