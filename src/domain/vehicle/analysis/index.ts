export type {
  OwnershipCostCategory,
  OwnershipCostEstimate,
  OwnershipCostItem,
} from "./ownership-cost";

export {
  estimateFuelConsumptionL100km,
  parseFuelConsumptionValue,
} from "./fuel-consumption-estimate";

export { estimateOwnershipCost } from "./ownership-cost-estimate";

export type {
  AnalysisConfidence,
  BuyConfidenceScore,
  DealScore,
  ScoreFactor,
  ScoreFactorImpact,
} from "./scores";

export type {
  MarketValueEstimate,
  VehicleAnalysis,
} from "./vehicle-analysis";

export {
  buildVehicleInsightBenchmarks,
  generateVehicleInsights,
} from "./vehicle-insights";

export type {
  VehicleInsight,
  VehicleInsightBenchmarks,
  VehicleInsightCategory,
  VehicleInsightEvidence,
  VehicleInsightImpact,
  VehicleInsightInput,
  VehicleInsightScore,
  VehicleInsightSource,
} from "./vehicle-insights";
