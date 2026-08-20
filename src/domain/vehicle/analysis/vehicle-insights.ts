import type { VehicleListing } from "../listing";
import type { Vehicle } from "../vehicle";
import type { VehicleAnalysis } from "./vehicle-analysis";

export type VehicleInsightImpact = "positive" | "neutral" | "negative";
export type VehicleInsightCategory =
  | "price"
  | "mileage"
  | "ownership_cost"
  | "history"
  | "warranty"
  | "market_confidence";
export type VehicleInsightScore = "deal" | "buy_confidence" | "both";
export type VehicleInsightSource = "calculated" | "listing_claim";

export interface VehicleInsightEvidence {
  metric: string;
  value: number | string;
  comparisonValue?: number;
  unit?: "percent" | "SEK" | "km_per_year" | "count";
}

/** A deterministic, evidence-backed explanation produced by an insight rule. */
export interface VehicleInsight {
  id: string;
  category: VehicleInsightCategory;
  impact: VehicleInsightImpact;
  /** Integer from 0 (least relevant) to 100 (most relevant). */
  relevance: number;
  relatedScore: VehicleInsightScore;
  source: VehicleInsightSource;
  message: string;
  evidence: VehicleInsightEvidence;
}

export interface VehicleInsightInput {
  vehicle: Vehicle;
  listing: VehicleListing;
  analysis: Pick<
    VehicleAnalysis,
    "calculatedAt" | "marketValue" | "ownershipCost" | "dealScore" | "buyConfidenceScore"
  >;
}

export interface VehicleInsightBenchmarks {
  medianAnnualMileageKm: number;
  medianAnnualOwnershipCost: number;
  sampleSize: number;
}

function clampRelevance(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function median(values: readonly number[]) {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function annualMileageKm(input: VehicleInsightInput) {
  const analysisYear = new Date(input.analysis.calculatedAt).getFullYear();
  const ageYears = Math.max(1, analysisYear - input.vehicle.identity.modelYear);
  return input.listing.mileageKm / ageYears;
}

export function buildVehicleInsightBenchmarks(
  inputs: readonly VehicleInsightInput[],
): VehicleInsightBenchmarks {
  return {
    medianAnnualMileageKm: median(inputs.map(annualMileageKm)),
    medianAnnualOwnershipCost: median(
      inputs.map(({ analysis }) => analysis.ownershipCost.annualCost.amount),
    ),
    sampleSize: inputs.length,
  };
}

/**
 * Evaluates every supported rule, then returns all applicable insights ranked
 * by relevance. Messages are templates backed by the attached evidence.
 */
export function generateVehicleInsights(
  input: VehicleInsightInput,
  benchmarks: VehicleInsightBenchmarks,
): readonly VehicleInsight[] {
  const { listing, analysis } = input;
  const insights: VehicleInsight[] = [];
  const askingPrice = listing.price.askingPrice.amount;
  const marketValue = analysis.marketValue.value.amount;
  const priceDeltaPercent = ((marketValue - askingPrice) / marketValue) * 100;
  const roundedPriceDelta = Math.round(Math.abs(priceDeltaPercent));

  if (priceDeltaPercent >= 2.5) {
    insights.push({
      id: "price-below-market",
      category: "price",
      impact: "positive",
      relevance: clampRelevance(66 + priceDeltaPercent * 2.6),
      relatedScore: "deal",
      source: "calculated",
      message: `Prissatt ${roundedPriceDelta} % under uppskattat marknadsvärde`,
      evidence: {
        metric: "price_vs_market_value",
        value: askingPrice,
        comparisonValue: marketValue,
        unit: "SEK",
      },
    });
  } else if (priceDeltaPercent <= -2.5) {
    insights.push({
      id: "price-above-market",
      category: "price",
      impact: "negative",
      relevance: clampRelevance(70 + Math.abs(priceDeltaPercent) * 2.6),
      relatedScore: "deal",
      source: "calculated",
      message: `Prissatt ${roundedPriceDelta} % över uppskattat marknadsvärde`,
      evidence: {
        metric: "price_vs_market_value",
        value: askingPrice,
        comparisonValue: marketValue,
        unit: "SEK",
      },
    });
  } else {
    insights.push({
      id: "price-near-market",
      category: "price",
      impact: "neutral",
      relevance: 52,
      relatedScore: "deal",
      source: "calculated",
      message: "Priset ligger nära uppskattat marknadsvärde",
      evidence: {
        metric: "price_vs_market_value",
        value: askingPrice,
        comparisonValue: marketValue,
        unit: "SEK",
      },
    });
  }

  const previousPrice = listing.price.previousAskingPrice?.amount;
  if (previousPrice && previousPrice > askingPrice) {
    const reductionPercent = ((previousPrice - askingPrice) / previousPrice) * 100;
    insights.push({
      id: "recent-price-reduction",
      category: "price",
      impact: "positive",
      relevance: clampRelevance(58 + reductionPercent * 4),
      relatedScore: "deal",
      source: "calculated",
      message: `Priset har sänkts med ${Math.round(reductionPercent)} %`,
      evidence: {
        metric: "price_reduction",
        value: askingPrice,
        comparisonValue: previousPrice,
        unit: "SEK",
      },
    });
  }

  if (benchmarks.sampleSize >= 3 && benchmarks.medianAnnualMileageKm > 0) {
    const vehicleAnnualMileage = annualMileageKm(input);
    const mileageDelta =
      ((benchmarks.medianAnnualMileageKm - vehicleAnnualMileage) /
        benchmarks.medianAnnualMileageKm) *
      100;

    if (Math.abs(mileageDelta) >= 15) {
      const isLower = mileageDelta > 0;
      insights.push({
        id: isLower ? "lower-annual-mileage" : "higher-annual-mileage",
        category: "mileage",
        impact: isLower ? "positive" : "negative",
        relevance: clampRelevance(57 + Math.abs(mileageDelta) * 0.9),
        relatedScore: "both",
        source: "calculated",
        message: `${Math.round(Math.abs(mileageDelta))} % ${isLower ? "lägre" : "högre"} årsmiltal än urvalet`,
        evidence: {
          metric: "annual_mileage",
          value: Math.round(vehicleAnnualMileage),
          comparisonValue: Math.round(benchmarks.medianAnnualMileageKm),
          unit: "km_per_year",
        },
      });
    }
  }

  if (benchmarks.sampleSize >= 3 && benchmarks.medianAnnualOwnershipCost > 0) {
    const annualCost = analysis.ownershipCost.annualCost.amount;
    const costDelta =
      ((benchmarks.medianAnnualOwnershipCost - annualCost) /
        benchmarks.medianAnnualOwnershipCost) *
      100;

    if (Math.abs(costDelta) >= 8) {
      const isLower = costDelta > 0;
      insights.push({
        id: isLower ? "lower-ownership-cost" : "higher-ownership-cost",
        category: "ownership_cost",
        impact: isLower ? "positive" : "negative",
        relevance: clampRelevance(62 + Math.abs(costDelta) * 1.25),
        relatedScore: "buy_confidence",
        source: "calculated",
        message: `${Math.round(Math.abs(costDelta))} % ${isLower ? "lägre" : "högre"} uppskattad ägandekostnad än urvalet`,
        evidence: {
          metric: "annual_ownership_cost",
          value: annualCost,
          comparisonValue: benchmarks.medianAnnualOwnershipCost,
          unit: "SEK",
        },
      });
    }
  }

  if (listing.serviceHistory === "complete") {
    insights.push({
      id: "complete-service-history",
      category: "history",
      impact: "positive",
      relevance: 72,
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: "Fullständig servicehistorik uppges",
      evidence: { metric: "service_history", value: listing.serviceHistory },
    });
  } else if (listing.serviceHistory === "partial") {
    insights.push({
      id: "partial-service-history",
      category: "history",
      impact: "negative",
      relevance: 78,
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: "Endast delvis dokumenterad servicehistorik",
      evidence: { metric: "service_history", value: listing.serviceHistory },
    });
  } else if (listing.serviceHistory === "missing") {
    insights.push({
      id: "missing-service-history",
      category: "history",
      impact: "negative",
      relevance: 92,
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: "Dokumenterad servicehistorik saknas",
      evidence: { metric: "service_history", value: listing.serviceHistory },
    });
  }

  if (listing.ownerCount === 1) {
    insights.push({
      id: "single-owner",
      category: "history",
      impact: "positive",
      relevance: 68,
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: "Endast en tidigare ägare uppges",
      evidence: { metric: "owner_count", value: listing.ownerCount, unit: "count" },
    });
  } else if (listing.ownerCount && listing.ownerCount >= 3) {
    insights.push({
      id: "multiple-owners",
      category: "history",
      impact: "negative",
      relevance: clampRelevance(66 + listing.ownerCount * 2),
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: `${listing.ownerCount} tidigare ägare uppges`,
      evidence: { metric: "owner_count", value: listing.ownerCount, unit: "count" },
    });
  }

  if (listing.warranty?.included) {
    insights.push({
      id: "warranty-included",
      category: "warranty",
      impact: "positive",
      relevance: 64,
      relatedScore: "buy_confidence",
      source: "listing_claim",
      message: listing.warranty.description
        ? `${listing.warranty.description} ingår enligt annonsen`
        : "Garanti ingår enligt annonsen",
      evidence: { metric: "warranty_included", value: "yes" },
    });
  }

  if (
    analysis.marketValue.confidence === "high" &&
    analysis.marketValue.comparableListingCount >= 15
  ) {
    insights.push({
      id: "strong-market-evidence",
      category: "market_confidence",
      impact: "neutral",
      relevance: 56,
      relatedScore: "deal",
      source: "calculated",
      message: `Marknadsvärdet stöds av ${analysis.marketValue.comparableListingCount} jämförbara annonser`,
      evidence: {
        metric: "comparable_listing_count",
        value: analysis.marketValue.comparableListingCount,
        unit: "count",
      },
    });
  }

  return insights.toSorted((left, right) => right.relevance - left.relevance);
}
