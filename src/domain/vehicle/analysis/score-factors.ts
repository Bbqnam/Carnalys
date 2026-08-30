import type { ScoreFactor, ScoreFactorImpact } from "./scores";

export interface ScoreFactorInputs {
  /** True when the asking price could be compared to a market value. */
  hasMarketEstimate: boolean;
  /** (marketValue - askingPrice) / marketValue; only meaningful when compared. */
  priceDelta: number;
  /** 0-100 price attractiveness sub-score, for the factor bar. */
  priceValueScore: number;
  /** Why the price was not rated (0 = it was rated). See price-plausibility. */
  priceReasonCode: number;
  ageScore: number;
  mileageScore: number;
  serviceHistoryScore: number;
  ownerScore: number;
  hasServiceHistory: boolean;
  ownerCount?: number;
  age: number;
  modelYear: number;
  mileageKm: number;
}

function classify(score: number): ScoreFactorImpact {
  if (score >= 75) return "positive";
  if (score <= 45) return "negative";
  return "neutral";
}

/**
 * The one and only Deal Score factor: price against the market. When the price
 * was not rated it carries the reason code instead of a percentage, so the UI
 * can explain *why* there is no score rather than showing a silent 50.
 */
function priceVsMarketFactor(inputs: ScoreFactorInputs): ScoreFactor {
  if (!inputs.hasMarketEstimate) {
    return {
      key: "price_vs_market",
      impact: "neutral",
      score: inputs.priceValueScore,
      params: { reasonCode: inputs.priceReasonCode },
    };
  }

  const impact: ScoreFactorImpact =
    inputs.priceDelta > 0.03
      ? "positive"
      : inputs.priceDelta < -0.03
        ? "negative"
        : "neutral";

  return {
    key: "price_vs_market",
    impact,
    score: inputs.priceValueScore,
    params: { percent: Math.round(Math.abs(inputs.priceDelta) * 100) },
  };
}

/**
 * Buy Confidence's condition factor: age, mileage and service history rolled
 * into one reliability statement rather than restating the raw numbers.
 */
function conditionFactor(inputs: ScoreFactorInputs): ScoreFactor {
  const combinedScore = Math.round(
    (inputs.ageScore + inputs.mileageScore + inputs.serviceHistoryScore) / 3,
  );
  return {
    key: "condition",
    impact: classify(combinedScore),
    score: combinedScore,
    params: {},
  };
}

function ownershipHistoryFactor(inputs: ScoreFactorInputs): ScoreFactor {
  return {
    key: "ownership_history",
    impact: classify(inputs.ownerScore),
    score: inputs.ownerScore,
    params:
      inputs.ownerCount === undefined ? {} : { ownerCount: inputs.ownerCount },
  };
}

/**
 * Philosophy A: the Deal Score is the price comparison, so that is its only
 * factor. Age, mileage and price bracket are not listed here because they do
 * not move the score — they are already inside the market value it is measured
 * against.
 */
export function buildDealScoreFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [priceVsMarketFactor(inputs)];
}

export function buildBuyConfidenceFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [conditionFactor(inputs), ownershipHistoryFactor(inputs)];
}
