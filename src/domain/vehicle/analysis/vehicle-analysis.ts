import type { Money, ISODateTime, ListingId, VehicleId } from "../types";
import type { OwnershipCostEstimate } from "./ownership-cost";
import type {
  AnalysisConfidence,
  BuyConfidenceScore,
  DealScore,
} from "./scores";
import type { VehicleInsight } from "./vehicle-insights";

export interface MarketValueEstimate {
  value: Money;
  range: {
    minimum: Money;
    maximum: Money;
  };
  confidence: AnalysisConfidence;
  comparableListingCount: number;
  /** Asking prices of the comparable listings the estimate was derived from. */
  comparablePrices: readonly number[];
  explanation: string;
}

/**
 * Calculated and estimated outputs. This record is never populated directly
 * from a marketplace listing.
 */
export interface VehicleAnalysis {
  vehicleId: VehicleId;
  listingId: ListingId;
  methodologyVersion: string;
  calculatedAt: ISODateTime;
  marketValue: MarketValueEstimate;
  ownershipCost: OwnershipCostEstimate;
  dealScore: DealScore;
  buyConfidenceScore: BuyConfidenceScore;
  /** Ranked, deterministic explanations derived from the evidence above. */
  insights: readonly VehicleInsight[];
}
