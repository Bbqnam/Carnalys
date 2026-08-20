export interface BlocketSearchDocument {
  id: string;
  heading: string;
  canonicalUrl: string;
  location: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  timestamp?: Date;
  priceAmount: number;
  organisationName?: string;
  year: number;
  mileageMil: number;
  dealerSegment?: string;
  registrationNumber?: string;
  vin?: string;
  make: string;
  model: string;
  variant?: string;
  transmission?: string;
  fuel?: string;
  imageUrls: readonly string[];
  thumbnail?: {
    url: string;
    width?: number;
    height?: number;
  };
  raw: Record<string, unknown>;
}

export interface BlocketListingDetail {
  description?: string;
  equipment: readonly string[];
  specifications: Readonly<Record<string, string>>;
  raw: Record<string, unknown>;
}
