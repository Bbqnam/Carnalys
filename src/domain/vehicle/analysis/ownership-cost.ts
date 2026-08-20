import type { Money } from "../types";
import type { AnalysisConfidence } from "./scores";

export type OwnershipCostCategory =
  | "depreciation"
  | "energy"
  | "insurance"
  | "maintenance"
  | "tax";

export interface OwnershipCostItem {
  category: OwnershipCostCategory;
  annualCost: Money;
  explanation: string;
}

/** Estimated annual ownership cost based on explicit usage assumptions. */
export interface OwnershipCostEstimate {
  annualCost: Money;
  estimatedForAnnualDistanceKm: number;
  confidence: AnalysisConfidence;
  items: readonly OwnershipCostItem[];
  assumptions: readonly string[];
}
