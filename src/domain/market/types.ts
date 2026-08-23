import type { FuelType, TransmissionType } from "@/domain/vehicle";

/**
 * The filter set the Analysis page works from. Deliberately narrower than the
 * search page's `SearchFilters`: every field here is one the market analysis
 * can actually control for, and the page must stay useful with none of them
 * set.
 */
export interface MarketAnalysisFilters {
  brands: readonly string[];
  models: readonly string[];
  fuelType: FuelType | "";
  transmission: TransmissionType | "";
  minYear: number | null;
  maxYear: number | null;
  minMileageMil: number | null;
  maxMileageMil: number | null;
}

export interface MarketSnapshot {
  listingCount: number;
  /**
   * Medians rather than averages throughout: a handful of collector cars or
   * mis-keyed prices move a mean by tens of percent and a median barely at
   * all.
   */
  medianPrice: number | null;
  medianMileageKm: number | null;
  medianModelYear: number | null;
  priceP25: number | null;
  priceP75: number | null;
}

export interface PriceMileagePoint {
  listingId: string;
  price: number;
  mileageKm: number;
  modelYear: number;
  title: string;
  variant?: string;
  sellerType: "dealer" | "private";
  municipality: string;
}

export interface PriceMileageChart {
  points: readonly PriceMileagePoint[];
  /** Listings matching the filters, before sampling or outlier trimming. */
  matchingCount: number;
  /** Listings left outside the axes by the 1st/99th percentile trim. */
  trimmedCount: number;
  priceMinimum: number;
  priceMaximum: number;
  mileageMinimumKm: number;
  mileageMaximumKm: number;
  /** True when `points` is a random sample rather than every match. */
  sampled: boolean;
}

export interface ValueMapBand {
  key: string;
  fromKm: number;
  /** `null` means open-ended (the top band). */
  toKm: number | null;
}

export interface ValueMapYearGroup {
  key: string;
  fromYear: number;
  toYear: number;
}

export interface ValueMapCell {
  yearKey: string;
  bandKey: string;
  medianPrice: number;
  listingCount: number;
}

export interface ValueMap {
  yearGroups: readonly ValueMapYearGroup[];
  bands: readonly ValueMapBand[];
  cells: readonly ValueMapCell[];
  /** Cells at or below this count are drawn as low confidence. */
  lowConfidenceThreshold: number;
  /** Below this, a median is not shown at all. */
  minimumCellCount: number;
}

export interface MarketEstimate {
  /** Percentage change in asking price. */
  percent: number;
  /** The same effect in kronor, evaluated at the selection's median price. */
  amount: number;
  /** Coefficient / standard error; the page hides estimates below 2. */
  tStatistic: number;
}

export interface ValueRelationships {
  available: boolean;
  /** Why nothing is shown, when `available` is false. */
  unavailableReason?: "insufficient_data" | "no_variation";
  observationCount: number;
  /** Make+model cells absorbed, i.e. how many distinct models were compared. */
  modelCount: number;
  rSquared: number;
  medianPrice: number | null;
  /** Effect of one *newer* model year. Positive means newer costs more. */
  perModelYear?: MarketEstimate;
  /** Effect of 1,000 mil *less* mileage. Positive means lower mileage costs more. */
  perThousandMil?: MarketEstimate;
  /** Asking-price gap between private sellers and dealers, dealer as baseline. */
  privateSellerGap?: MarketEstimate;
  /**
   * How much mileage one model year is worth, in mil — the number that
   * actually answers "newer car with more miles, or older with fewer?".
   */
  yearMileageEquivalentMil?: number;
}

export type BuyerVerdict = "great" | "good" | "normal" | "expensive";

export interface BuyerScoreComponent {
  key: "price" | "inventory" | "reductions" | "listing_age";
  /** Where this month sits versus the baseline, in the component's own unit. */
  value: number;
  /** Points this component contributed to the score, signed. */
  contribution: number;
}

export interface SeasonalMonth {
  /** 1-12. */
  month: number;
  observationCount: number;
  /** Distinct listings observed live in this calendar month. */
  listingCount: number;
  medianPrice: number | null;
  /**
   * Asking price versus the comparable annual baseline, in percent, after
   * controlling for vehicle mix. Negative means cheaper than baseline.
   */
  relativePricePercent: number | null;
  /** Live listings, indexed against the annual average (100 = typical). */
  inventoryIndex: number | null;
  /** Share of live listings whose asking price was cut during the month. */
  priceReductionRate: number | null;
  /** Median days between a listing being advertised and this observation. */
  medianListingAgeDays: number | null;
  buyerScore: number | null;
  verdict: BuyerVerdict | null;
  components: readonly BuyerScoreComponent[];
}

export type HistoryConfidence = "none" | "low" | "medium" | "high";

export interface SeasonalAnalysis {
  months: readonly SeasonalMonth[];
  /** Distinct calendar months (year-month) with any observation. */
  coveredMonthCount: number;
  /** Distinct calendar months with enough observations to score. */
  scoredMonthCount: number;
  observationCount: number;
  confidence: HistoryConfidence;
  /**
   * False until there is enough coverage to talk about seasonality at all;
   * the page then says "recent market trend" instead.
   */
  isSeasonal: boolean;
  earliestObservationAt: string | null;
  latestObservationAt: string | null;
}

export interface VariantValue {
  variant: string;
  listingCount: number;
  medianPrice: number;
  medianModelYear: number;
  /**
   * Asking price against comparable cars of the same model, year and mileage
   * band. Negative means this version asks less than its specification would
   * predict.
   */
  valuePercent: number;
}

export interface VariantValueRanking {
  /** Best value first. */
  variants: readonly VariantValue[];
  minimumListings: number;
}

export interface DepreciationPoint {
  modelYear: number;
  listingCount: number;
  medianPrice: number;
  /** Median asking price as a share of the newest model year present. */
  retainedPercent: number;
}

export interface DepreciationCurve {
  points: readonly DepreciationPoint[];
  /**
   * The model year just before the steepest year-on-year drop — where the
   * biggest single chunk of depreciation has already been paid by someone
   * else.
   */
  sweetSpotYear: number | null;
  baselineYear: number | null;
}

export interface EquipmentValueItem {
  label: string;
  listingCount: number;
  /** Asking-price difference associated with having this equipment. */
  premiumPercent: number;
}

export interface EquipmentValue {
  items: readonly EquipmentValueItem[];
  minimumListings: number;
}

export interface RegionalPrice {
  municipality: string;
  listingCount: number;
  medianPrice: number;
  /** Mix-adjusted difference from the selection's national level. */
  differencePercent: number;
}

export interface RegionalPrices {
  cheapest: readonly RegionalPrice[];
  priciest: readonly RegionalPrice[];
  regionCount: number;
  minimumListings: number;
}

export interface MarketAnalysis {
  filters: MarketAnalysisFilters;
  snapshot: MarketSnapshot;
  priceMileage: PriceMileageChart;
  valueMap: ValueMap;
  valueRelationships: ValueRelationships;
  variantValue: VariantValueRanking;
  depreciation: DepreciationCurve;
  equipmentValue: EquipmentValue;
  regionalPrices: RegionalPrices;
  seasonal: SeasonalAnalysis;
}
