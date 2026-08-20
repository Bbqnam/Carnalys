import type { ListingPrice } from "./pricing";
import type { SourceMetadata } from "./source";
import type { ISODate, ISODateTime, ListingId, VehicleId } from "./types";

export type SellerType = "dealer" | "private";

export interface ListingSeller {
  type: SellerType;
  name?: string;
  organizationNumber?: string;
}

export interface ListingLocation {
  municipality: string;
  county?: string;
  countryCode: "SE";
  latitude?: number;
  longitude?: number;
}

export type ServiceHistoryStatus =
  | "complete"
  | "partial"
  | "missing"
  | "unknown";

export interface ListingWarranty {
  included: boolean;
  expiresAt?: ISODate;
  distanceLimitKm?: number;
  description?: string;
}

export interface ListingImage {
  url: string;
  alt?: string;
  position: number;
}

export type ListingStatus = "active" | "reserved" | "sold" | "removed";

/**
 * A normalized snapshot of claims made by one source. These values are not Car
 * Finder conclusions and may differ between listings for the same vehicle.
 */
export interface VehicleListing {
  id: ListingId;
  vehicleId: VehicleId;
  source: SourceMetadata;
  seller: ListingSeller;
  price: ListingPrice;
  location: ListingLocation;
  status: ListingStatus;
  title: string;
  description?: string;
  mileageKm: number;
  ownerCount?: number;
  serviceHistory: ServiceHistoryStatus;
  warranty?: ListingWarranty;
  equipment: readonly string[];
  images: readonly ListingImage[];
  publishedAt?: ISODateTime;
  observedAt: ISODateTime;
}
