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
}

export interface SearchFilters {
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
  brands: readonly string[];
  models: readonly string[];
  fuelType: FuelType | "";
  transmission: TransmissionType | "";
  minYear: number | null;
  maxYear: number | null;
  minMileageMil: number | null;
  maxMileageMil: number | null;
  bodyStyle: BodyStyle | "";
  sellerType: SellerType | "";
}

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

export const vehiclePageSizes = [12, 24, 48] as const;
export type VehiclePageSize = (typeof vehiclePageSizes)[number];

export interface VehicleSearchOptions {
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  pageSize: VehiclePageSize;
}
