export type AnalysisConfidence = "low" | "medium" | "high";

export type ScoreFactorImpact = "positive" | "neutral" | "negative";

export interface ScoreFactor {
  key: string;
  label: string;
  impact: ScoreFactorImpact;
  explanation: string;
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
