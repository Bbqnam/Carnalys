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
  };
  listing: {
    sellerName?: string;
    sellerType: "dealer" | "private";
    priceAmount: number;
    previousPriceAmount?: number;
    monthlyCostAmount?: number;
    mileageKm: number;
    location: string;
    municipality: string;
    description?: string;
    serviceHistory: ServiceHistoryStatus;
    equipment: readonly string[];
    images: readonly NormalizedListingImage[];
  };
  rawPayload?: unknown;
}

export interface MarketplaceImportChunk {
  listings: readonly NormalizedVehicleListing[];
  rejectedCount: number;
}

export interface MarketplaceImporter {
  readonly provider: string;
  readonly scope: string;
  import(): AsyncIterable<MarketplaceImportChunk>;
}
