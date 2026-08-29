export interface HedinSearchDocument {
  /** Hedin's numeric car id — the source external identifier. */
  id: string;
  slug: string;
  detailPath: string;
  brand?: string;
  model?: string;
  variant?: string;
  registrationNumber?: string;
  modelYear?: number;
  mileageKm?: number;
  priceAmount?: number;
  fuel?: string;
  gearbox?: string;
  city?: string;
  condition?: string;
  featuredImageUrl?: string;
  raw: Record<string, unknown>;
}

export interface HedinSearchPage {
  documents: readonly HedinSearchDocument[];
  totalItems: number;
  pageSize: number;
  rejectedCount: number;
}

export interface HedinListingDetail {
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  variant?: string;
  vin?: string;
  registrationNumber?: string;
  modelYear?: number;
  firstRegistration?: Date;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  colour?: string;
  doors?: number;
  mileageKm?: number;
  priceAmount?: number;
  monthlyCostAmount?: number;
  sellerName?: string;
  city?: string;
  /** Branch coordinates from the detail page's `site.site_geocoord`. */
  latitude?: number;
  longitude?: number;
  images: readonly string[];
  equipment: readonly string[];
  raw: Record<string, unknown>;
}
