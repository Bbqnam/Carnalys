/**
 * Autohero (AUTO1 Group's Swedish online used-car retailer). Every car is sold
 * and reconditioned by Autohero itself and delivered nationwide, so there is
 * one seller and one small (~350 car) catalogue.
 *
 * Search comes from an unauthenticated GraphQL endpoint
 * (`/v1/retail-customer-gateway/graphql`, `searchAdV9AdsV2`) which already
 * returns a rich per-car object — price history, mileage, powertrain, owner
 * count, service-book flag, branch, first-published date. The detail page adds
 * only what search omits: VIN, registration number, body type, the full image
 * gallery and the categorised equipment list. It is parsed from the
 * `window.__APOLLO_STATE__` blob the page ships (same approach as Wayke/Hedin).
 */
export interface AutoheroSearchDocument {
  id: string;
  stockNumber?: string;
  slug: string;
  make: string;
  model: string;
  subType?: string;
  subTypeExtra?: string;
  modelYear: number;
  registrationYear?: number;
  firstRegistration?: Date;
  mileageKm: number;
  priceAmount: number;
  previousPriceAmount?: number;
  monthlyCostAmount?: number;
  /** AUTO1 fuel-type enum id (1039 petrol, 1040 diesel, 1044 electric, …). */
  fuelTypeId?: number;
  /** AUTO1 transmission enum id (1138 manual, 1139 automatic, 1140 semi-auto). */
  gearTypeId?: number;
  driveTrain?: string;
  /** Autohero labels parallel and plug-in hybrids identically; this flag is the
   *  only reliable separator in the search payload. */
  isPluginSystem?: boolean;
  powerKw?: number;
  engineDisplacementCc?: number;
  co2Value?: number;
  fuelConsumptionCombined?: number;
  ownerCount?: number;
  hasFilledServiceBook?: boolean;
  city?: string;
  zipcode?: string;
  branchName?: string;
  publishedAt?: Date;
  firstPublishedAt?: Date;
  featuredImageUrl?: string;
  usps: readonly string[];
  raw: Record<string, unknown>;
}

export interface AutoheroSearchPage {
  documents: readonly AutoheroSearchDocument[];
  totalMatches: number;
  offset: number;
  hitsPerPage: number;
  rejectedCount: number;
}

export interface AutoheroListingDetail {
  title?: string;
  description?: string;
  vin?: string;
  registrationNumber?: string;
  variant?: string;
  bodyType?: string;
  fuelType?: string;
  transmission?: string;
  drivetrain?: string;
  colour?: string;
  doors?: number;
  seats?: number;
  horsepower?: number;
  engineDisplacementCc?: number;
  fuelConsumption?: string;
  mileageKm?: number;
  priceAmount?: number;
  ownerCount?: number;
  serviceHistory?: "complete" | "partial" | "missing" | "unknown";
  images: readonly string[];
  equipment: readonly string[];
  raw: Record<string, unknown>;
}
