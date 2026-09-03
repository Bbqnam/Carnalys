import type { SearchFilters } from "@/features/search/types";

export type AnalystLocale = "en" | "sv";
export type AnalystSurface = "listing" | "search" | "comparison";

export interface AnalystConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type AnalystContext =
  | { surface: "listing"; listingId: string }
  | { surface: "search"; filters: SearchFilters }
  | { surface: "comparison"; listingIds: readonly string[] };

export interface AnalystRequest {
  message: string;
  locale: AnalystLocale;
  context: AnalystContext;
  conversation: readonly AnalystConversationMessage[];
}

export type AnalystToolName =
  | "get_listing_analysis"
  | "analyse_listing_market"
  | "search_inventory"
  | "compare_listings";

export interface AnalystListingPreview {
  listingId: string;
  name: string;
  variant?: string;
  modelYear: number;
  priceAmount: number;
  mileageKm: number;
  fuelType: string;
  transmission: string;
  sellerType: "dealer" | "private";
  dealScore: number | null;
  monthlyCostAmount?: number;
  marketValueAmount?: number | null;
  imageUrl?: string;
}

export interface AnalystEvidence {
  id: string;
  kind: "listing" | "score" | "history" | "cohort" | "comparable" | "search" | "ownership";
  label: string;
  asOf: string;
  sampleSize?: number;
  href?: string;
  warning?: string;
  /** Structured card data for listing/comparable evidence the UI renders visually. */
  listing?: AnalystListingPreview;
}

export interface AnalystToolResult<T = unknown> {
  tool: AnalystToolName;
  data: T;
  evidence: readonly AnalystEvidence[];
}

export interface AnalystStreamEvent {
  type: "status" | "delta" | "evidence" | "done" | "error";
  message?: string;
  delta?: string;
  evidence?: readonly AnalystEvidence[];
  truncated?: boolean;
  requestId?: string;
}

export interface CompactListing {
  listingId: string;
  name: string;
  variant?: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
  municipality: string;
  sellerType: "dealer" | "private";
  bodyStyle: string;
  fuelType: string;
  transmission: string;
  horsepower?: number;
  storedAnalysis: {
    dealScore: number | null;
    buyConfidence: number;
    dataConfidence: "low" | "medium" | "high";
    marketValueAmount: number | null;
    calculatedAt?: string;
  };
  ownership: {
    annualCostAmount: number;
    monthlyCostAmount: number;
    confidence: "low" | "medium" | "high";
  };
  freshness: {
    firstSeenAt: string;
    lastSeenAt: string;
    synchronizedAt: string;
  };
  missingFields: readonly string[];
  href: string;
  imageUrl?: string;
}

