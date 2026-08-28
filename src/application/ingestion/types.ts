import type {
  BodyStyle,
  Drivetrain,
  FuelType,
  ServiceHistoryStatus,
  TransmissionType,
} from "@/domain/vehicle";

export interface NormalizedListingImage {
  url: string;
  thumbnailUrl?: string;
  alt?: string;
  position: number;
  width?: number;
  height?: number;
}

/** Source-independent write model produced by every marketplace normalizer. */
export interface NormalizedVehicleListing {
  source: {
    provider: string;
    scope: string;
    externalId: string;
    listingUrl: string;
    observedAt: Date;
    publishedAt?: Date;
    updatedAt?: Date;
  };
  vehicle: {
    vin?: string;
    registrationNumber?: string;
    make: string;
    model: string;
    variant?: string;
    modelYear: number;
    registrationYear?: number;
    firstRegistration?: Date;
    bodyStyle: BodyStyle;
    fuelType: FuelType;
    transmission: TransmissionType;
    drivetrain?: Drivetrain;
    horsepower?: number;
    engineDescription?: string;
    engineDisplacementCc?: number;
    fuelConsumption?: string;
  };
  listing: {
    title: string;
    sellerName?: string;
    sellerOrganizationNumber?: string;
    dealerStockNumber?: string;
    sellerType: "dealer" | "private";
    priceAmount: number;
    previousPriceAmount?: number;
    monthlyCostAmount?: number;
    mileageKm: number;
    location: string;
    municipality: string;
    latitude?: number;
    longitude?: number;
    description?: string;
    serviceHistory: ServiceHistoryStatus;
    ownerCount?: number;
    equipment: readonly string[];
    images: readonly NormalizedListingImage[];
  };
  rawPayload?: unknown;
}

export interface MarketplaceImportChunk {
  listings: readonly NormalizedVehicleListing[];
  rejectedCount: number;
}

export type SynchronizationMode = "incremental" | "reconciliation";
export type MarketplaceSortOrder =
  | "PUBLISHED_ASC"
  | "PUBLISHED_DESC"
  | "PRICE_DESC";

export interface VehicleSearchPartition {
  yearFrom: number;
  yearTo: number;
  priceFrom: number;
  priceTo: number;
  unboundedPriceTo?: boolean;
  mileageFrom: number;
  mileageTo: number;
}

export interface MarketplacePageRequest {
  partition?: VehicleSearchPartition;
  page: number;
  sortOrder: MarketplaceSortOrder;
}

export interface MarketplaceImportPage extends MarketplaceImportChunk {
  totalMatches: number;
  currentPage: number;
  lastPage: number;
}

export interface MarketplaceRequestFailure {
  attempt: number;
  maximumAttempts: number;
  error: unknown;
  httpStatus?: number;
  requestParameters: Record<string, string | number | boolean | undefined>;
}

export interface MarketplaceImporter {
  readonly source: MarketplaceSourceDefinition;
  readonly provider: string;
  readonly scope: string;
  readonly maximumResultsPerPartition: number;
  discoverCurrentMaximumPrice(
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ): Promise<number>;
  initialReconciliationPartition(maximumPrice: number): VehicleSearchPartition;
  splitPartition(
    partition: VehicleSearchPartition,
  ): readonly VehicleSearchPartition[];
  fetchPage(
    request: MarketplacePageRequest,
    onFailure: (failure: MarketplaceRequestFailure) => Promise<void>,
  ): Promise<MarketplaceImportPage>;
}

export interface MarketplaceSourceCapabilities {
  discovery: "page" | "offset" | "cursor";
  details: boolean;
  equipment: boolean;
  images: boolean;
  removalDetection: boolean;
}

export interface MarketplaceSourceDefinition {
  key: string;
  displayName: string;
  type: "marketplace" | "dealer" | "feed" | "api";
  logoKey?: string;
  capabilities: MarketplaceSourceCapabilities;
  requestPolicy: {
    minimumIntervalMs: number;
    maximumAttempts: number;
  };
}
