import type {
  BodyStyle,
  FuelType,
  SellerType,
  TransmissionType,
  Vehicle,
  VehicleAnalysis,
  VehicleListing,
} from "@/domain/vehicle";

export interface VehicleSearchResult {
  vehicle: Vehicle;
  listing: VehicleListing;
  analysis: VehicleAnalysis;
  relatedSourceListings?: readonly {
    id: string;
    provider: string;
    url: string;
    title?: string;
  }[];
}

export interface SearchFilters {
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
  brands: readonly string[];
  models: readonly string[];
  sources: readonly string[];
  fuelType: FuelType | "";
  transmission: TransmissionType | "";
  minYear: number | null;
  maxYear: number | null;
  minMileageMil: number | null;
  maxMileageMil: number | null;
  bodyStyle: BodyStyle | "";
  sellerType: SellerType | "";
  postedWithin: PostedWithin | "";
}

export type PostedWithin = "today" | "week" | "month";

export interface VehicleFilterOption<T extends string | number> {
  value: T;
  count: number;
}

export interface AvailableVehicleFilters {
  brands: readonly VehicleFilterOption<string>[];
  models: readonly VehicleFilterOption<string>[];
  years: readonly VehicleFilterOption<number>[];
  priceRange: { minimum: number; maximum: number };
}

export type SearchSort =
  | "deal_score"
  | "buy_confidence"
  | "price_asc"
  | "price_desc"
  | "newest";

/** One fixed page size: the results grid is sized for it, and a reader
 *  choosing a different one only ever traded scroll length for round trips. */
export type VehiclePageSize = 35;

export interface VehicleSearchOptions {
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  pageSize: VehiclePageSize;
}
