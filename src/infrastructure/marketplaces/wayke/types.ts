export interface WaykeSearchDocument {
  id: string;
  title: string;
  make: string;
  model: string;
  modelYear: number;
  mileageMil: number;
  priceAmount: number;
  previousPriceAmount?: number;
  fuel?: string;
  transmission?: string;
  sellerName?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  location: string;
  municipality: string;
  latitude?: number;
  longitude?: number;
  featuredImageUrl?: string;
  raw: Record<string, unknown>;
}

export interface WaykeSearchPage {
  documents: readonly WaykeSearchDocument[];
  totalMatches: number;
  offset: number;
  hitsPerPage: number;
  rejectedCount: number;
}

export interface WaykeListingDetail {
  title?: string;
  description?: string;
  vin?: string;
  registrationNumber?: string;
  variant?: string;
  modelYear?: number;
  registrationYear?: number;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  horsepower?: number;
  engineDisplacementCc?: number;
  fuelConsumption?: string;
  mileageKm?: number;
  sellerName?: string;
  priceAmount?: number;
  publishedAt?: Date;
  images: readonly string[];
  equipment: readonly string[];
  raw: Record<string, unknown>;
}
