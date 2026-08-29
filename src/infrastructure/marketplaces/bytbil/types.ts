export interface BytbilSearchDocument {
  /** Numeric ad id, stable across renewals — the source external identifier. */
  id: string;
  /** Path to the ad detail page, relative to https://www.bytbil.com. */
  detailPath: string;
  title: string;
  modelYear?: number;
  mileageMil?: number;
  priceAmount?: number;
  location?: string;
  featuredImageUrl?: string;
  /** Best-effort absolute time derived from the row's relative "publicerad" label. */
  publishedAt?: Date;
  raw: Record<string, unknown>;
}

export interface BytbilSearchPage {
  documents: readonly BytbilSearchDocument[];
  totalMatches: number;
  currentPage: number;
  pageSize: number;
  rejectedCount: number;
}

export interface BytbilListingDetail {
  title?: string;
  description?: string;
  make?: string;
  model?: string;
  variant?: string;
  registrationNumber?: string;
  modelYear?: number;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  horsepower?: number;
  engineDisplacementCc?: number;
  colour?: string;
  mileageKm?: number;
  priceAmount?: number;
  previousPriceAmount?: number;
  sellerName?: string;
  dealerId?: string;
  images: readonly string[];
  equipment: readonly string[];
  raw: Record<string, unknown>;
}
