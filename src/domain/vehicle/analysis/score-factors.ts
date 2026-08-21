import type { ScoreFactor, ScoreFactorImpact } from "./scores";

export interface ScoreFactorInputs {
  hasMarketEstimate: boolean;
  priceDelta: number;
  priceValueScore: number;
  ageScore: number;
  mileageScore: number;
  affordabilityScore: number;
  dealScore: number;
  ownerScore: number;
  ownerCount?: number;
  age: number;
  modelYear: number;
  mileageKm: number;
  askingPrice: number;
}

function classify(score: number): ScoreFactorImpact {
  if (score >= 75) return "positive";
  if (score <= 45) return "negative";
  return "neutral";
}

function priceVsMarketFactor(inputs: ScoreFactorInputs): ScoreFactor {
  if (!inputs.hasMarketEstimate) {
    return {
      key: "price_vs_market",
      impact: "neutral",
      score: inputs.priceValueScore,
      params: {},
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

function vehicleAgeFactor(inputs: ScoreFactorInputs): ScoreFactor {
  return {
    key: "vehicle_age",
    impact: classify(inputs.ageScore),
    score: inputs.ageScore,
    params: { age: inputs.age, modelYear: inputs.modelYear },
  };
}

function mileageFactor(inputs: ScoreFactorInputs): ScoreFactor {
  return {
    key: "mileage",
    impact: classify(inputs.mileageScore),
    score: inputs.mileageScore,
    params: { mileageKm: inputs.mileageKm },
  };
}

/**
 * Buy Confidence is partly derived from age + mileage too, but the Deal
 * Score card already states the raw facts ("11 år gammal", "187 000 km").
 * Repeating those verbatim reads as duplicated content, so this reframes
 * them as a single reliability/risk statement instead of restating numbers
 * the reader already saw one card up.
 */
function conditionFactor(inputs: ScoreFactorInputs): ScoreFactor {
  const combinedScore = Math.round((inputs.ageScore + inputs.mileageScore) / 2);
  const impact = classify(combinedScore);
  return {
    key: "condition",
    impact,
    score: combinedScore,
    params: {},
  };
}

function ownershipHistoryFactor(inputs: ScoreFactorInputs): ScoreFactor {
  const impact = classify(inputs.ownerScore);
  return {
    key: "ownership_history",
    impact,
    score: inputs.ownerScore,
    params:
      inputs.ownerCount === undefined ? {} : { ownerCount: inputs.ownerCount },
  };
}

export function buildDealScoreFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [
    priceVsMarketFactor(inputs),
    vehicleAgeFactor(inputs),
    mileageFactor(inputs),
    {
      key: "affordability",
      impact: classify(inputs.affordabilityScore),
      score: inputs.affordabilityScore,
      params: { askingPrice: inputs.askingPrice },
    },
  ];
}

/**
 * Deliberately independent of Deal Score/price — this used to reference
 * the Deal Score value directly, which made the two cards read as nearly
 * the same content. Now driven purely by condition and ownership history.
 */
export function buildBuyConfidenceFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [conditionFactor(inputs), ownershipHistoryFactor(inputs)];
}
