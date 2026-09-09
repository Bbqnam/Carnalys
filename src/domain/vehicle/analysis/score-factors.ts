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
  equipmentScore: number;
  transparencyScore: number;
  sellerProtectionScore: number;
  serviceModifier: number;
  defectModifier: number | null;
  mileageStatusCode: number;
  equipmentCoverageCode: number;
  defectCategoryCode: number;
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
 * The price component of Deal Score. When the price was not rated it carries
 * the reason code instead of a percentage, so the UI
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

function componentFactor(
  key: "vehicle_age" | "mileage" | "equipment" | "listing_transparency" | "seller_protection",
  score: number,
  params: Record<string, number> = {},
): ScoreFactor {
  return { key, impact: classify(score), score, params };
}

function modifierFactor(
  key: "service_history_modifier" | "known_defects_modifier",
  modifier: number | null,
  params: Record<string, number> = {},
): ScoreFactor {
  return {
    key,
    impact: modifier === null || modifier < 0 ? "negative" : modifier > 0 ? "positive" : "neutral",
    score: modifier === null ? 10 : Math.max(10, Math.min(95, 50 + modifier * 5)),
    params: { ...params, modifier: modifier ?? -99 },
  };
}

/**
 * Persist every v11 component and modifier. These are compact numeric records,
 * localized only when read, so diagnostics can explain an old calculation
 * without rerunning it or storing duplicated prose.
 */
export function buildDealScoreFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [
    priceVsMarketFactor(inputs),
    componentFactor("mileage", inputs.mileageScore, {
      mileageKm: inputs.mileageKm,
      statusCode: inputs.mileageStatusCode,
    }),
    componentFactor("vehicle_age", inputs.ageScore, {
      age: inputs.age,
      modelYear: inputs.modelYear,
    }),
    ownershipHistoryFactor(inputs),
    componentFactor("equipment", inputs.equipmentScore, {
      coverageCode: inputs.equipmentCoverageCode,
    }),
    componentFactor("listing_transparency", inputs.transparencyScore),
    componentFactor("seller_protection", inputs.sellerProtectionScore),
    modifierFactor("service_history_modifier", inputs.serviceModifier),
    modifierFactor("known_defects_modifier", inputs.defectModifier, {
      categoryCode: inputs.defectCategoryCode,
    }),
  ];
}

export function buildBuyConfidenceFactors(inputs: ScoreFactorInputs): ScoreFactor[] {
  return [conditionFactor(inputs), ownershipHistoryFactor(inputs)];
}
