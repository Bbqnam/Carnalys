import type { Money, ISODateTime, ListingId, VehicleId } from "../types";
import type { OwnershipCostEstimate } from "./ownership-cost";
import type {
  AnalysisConfidence,
  BuyConfidenceScore,
  DealScore,
} from "./scores";
import type { VehicleInsight } from "./vehicle-insights";
import type { ValuationConfidenceLabel } from "./valuation-confidence";

export interface MarketComparableEvidence {
  listingId?: string;
  provider?: string;
  make?: string;
  model?: string;
  title?: string | null;
  priceAmount: number;
  modelYear: number;
  mileageKm: number;
  sellerType?: string | null;
  tier: "A" | "B" | "C" | "D";
  score: number;
  reasons: readonly string[];
}

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
  /** Strongest individual evidence rows, ordered by effective similarity. */
  comparables: readonly MarketComparableEvidence[];
  valuationConfidence?: {
    score: number;
    label: ValuationConfidenceLabel;
  };
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
  scoringVersion: string;
  calculatedAt: ISODateTime;
  marketValue: MarketValueEstimate;
  ownershipCost: OwnershipCostEstimate;
  dealScore: DealScore;
  buyConfidenceScore: BuyConfidenceScore;
  /** Ranked, deterministic explanations derived from the evidence above. */
  insights: readonly VehicleInsight[];
}
