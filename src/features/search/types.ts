import type {
  BodyStyle,
  FuelType,
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
  brand: string;
  model: string;
  fuelType: FuelType | "";
  transmission: TransmissionType | "";
  minYear: number | null;
  maxMileageMil: number | null;
  bodyStyle: BodyStyle | "";
}

export type SearchSort =
  | "deal_score"
  | "buy_confidence"
  | "price_asc"
  | "price_desc"
  | "newest";

export interface VehicleSearchOptions {
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
}
