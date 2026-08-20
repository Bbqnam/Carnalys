import "server-only";

import { createHash } from "node:crypto";
import type {
  BodyStyle,
  Drivetrain,
  FuelType,
  ServiceHistoryStatus,
  TransmissionType,
} from "@/domain/vehicle";
import {
  buildVehicleInsightBenchmarks,
  generateVehicleInsights,
} from "@/domain/vehicle";
import type {
  SearchFilters,
  SearchSort,
  VehicleSearchOptions,
  VehicleSearchResult,
} from "@/features/search/types";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

type StoredListing = Prisma.ListingRecordGetPayload<{
  include: { vehicle: true; images: true; equipment: true };
}>;

const bodyStyles = new Set<BodyStyle>([
  "convertible",
  "coupe",
  "estate",
  "hatchback",
  "minivan",
  "pickup",
  "sedan",
  "suv",
  "van",
  "other",
]);
const fuelTypes = new Set<FuelType>([
  "diesel",
  "electric",
  "ethanol",
  "hydrogen",
  "petrol",
  "plug_in_hybrid",
  "self_charging_hybrid",
  "other",
]);
const transmissions = new Set<TransmissionType>(["automatic", "manual", "other"]);
const drivetrains = new Set<Drivetrain>([
  "all_wheel_drive",
  "front_wheel_drive",
  "rear_wheel_drive",
  "other",
]);
const serviceHistories = new Set<ServiceHistoryStatus>([
  "complete",
  "partial",
  "missing",
  "unknown",
]);

function enumValue<T extends string>(value: string | null, values: Set<T>, fallback: T) {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function stableSeed(value: string) {
  return Number.parseInt(createHash("sha1").update(value).digest("hex").slice(0, 8), 16);
}

function createPlaceholderAnalysis(result: StoredListing): VehicleSearchResult["analysis"] {
  const seed = stableSeed(result.id);
  const askingPrice = result.priceAmount;
  const marketPremium = 0.02 + (seed % 7) / 100;
  const marketValue = Math.round((askingPrice * (1 + marketPremium)) / 1_000) * 1_000;
  const dealScore = Math.min(95, Math.round(69 + marketPremium * 260));
  const fuelMultiplier = result.vehicle.fuelType === "electric" ? 0.8 : 1;
  const annualOwnership = Math.round(
    (34_000 + askingPrice * 0.065) * fuelMultiplier,
  );
  const buyConfidence = 76 + (seed % 14);
  const calculatedAt = result.synchronizedAt.toISOString();

  return {
    vehicleId: result.vehicleId,
    listingId: result.id,
    methodologyVersion: "listing-placeholder-1.0",
    calculatedAt,
    marketValue: {
      value: { amount: marketValue, currency: "SEK" },
      range: {
        minimum: { amount: Math.round(marketValue * 0.95), currency: "SEK" },
        maximum: { amount: Math.round(marketValue * 1.05), currency: "SEK" },
      },
      confidence: "low",
      comparableListingCount: 0,
      explanation: "Tillfällig modell tills marknadsvärderingen är ansluten.",
    },
    ownershipCost: {
      annualCost: { amount: annualOwnership, currency: "SEK" },
      estimatedForAnnualDistanceKm: 15_000,
      confidence: "low",
      items: [],
      assumptions: ["1 500 mil per år", "Tillfällig kostnadsmodell"],
    },
    dealScore: {
      kind: "deal",
      value: dealScore,
      confidence: "low",
      summary: "Preliminär bedömning i väntan på marknadsdata.",
      factors: [],
    },
    buyConfidenceScore: {
      kind: "buy_confidence",
      value: buyConfidence,
      confidence: "low",
      summary: "Preliminär bedömning i väntan på fordonsanalys.",
      factors: [],
    },
    insights: [],
  };
}

function mapStoredListing(record: StoredListing): VehicleSearchResult {
  const bodyStyle = enumValue(record.vehicle.bodyStyle, bodyStyles, "other");
  const fuelType = enumValue(record.vehicle.fuelType, fuelTypes, "other");
  const transmission = enumValue(
    record.vehicle.transmission,
    transmissions,
    "other",
  );
  const analysis = createPlaceholderAnalysis(record);

  return {
    vehicle: {
      id: record.vehicle.id,
      identity: {
        make: record.vehicle.make,
        model: record.vehicle.model,
        variant: record.vehicle.variant ?? undefined,
        modelYear: record.vehicle.modelYear,
        registrationYear: record.vehicle.registrationYear ?? undefined,
      },
      specification: {
        bodyStyle,
        powertrain: {
          fuelType,
          transmission,
          drivetrain: record.vehicle.drivetrain
            ? enumValue(record.vehicle.drivetrain, drivetrains, "other")
            : undefined,
          powerHp: record.vehicle.horsepower ?? undefined,
          engineDisplacementCc: record.vehicle.engineDisplacement ?? undefined,
          engineDescription: record.vehicle.engineDescription ?? undefined,
        },
      },
      registrationNumber: record.vehicle.registrationNumber ?? undefined,
      vin: record.vehicle.vin ?? undefined,
      firstRegistrationDate: record.vehicle.firstRegistration
        ?.toISOString()
        .slice(0, 10),
    },
    listing: {
      id: record.id,
      vehicleId: record.vehicleId,
      source: {
        provider: record.provider,
        type: "marketplace",
        externalId: record.externalId,
        url: record.listingUrl,
        firstSeenAt: record.firstSeenAt.toISOString(),
        lastSeenAt: record.lastSeenAt.toISOString(),
      },
      seller: {
        type: record.sellerType === "private" ? "private" : "dealer",
        name: record.sellerName ?? undefined,
      },
      price: {
        askingPrice: { amount: record.priceAmount, currency: "SEK" },
        previousAskingPrice: record.previousPriceAmount
          ? { amount: record.previousPriceAmount, currency: "SEK" }
          : undefined,
        monthlyCost: record.monthlyCostAmount
          ? { amount: record.monthlyCostAmount, currency: "SEK" }
          : undefined,
      },
      location: {
        municipality: record.municipality,
        countryCode: "SE",
      },
      status: "active",
      title: `${record.vehicle.make} ${record.vehicle.model} ${record.vehicle.variant ?? ""}`.trim(),
      description: record.description ?? undefined,
      mileageKm: record.mileageKm,
      serviceHistory: enumValue(
        record.serviceHistory,
        serviceHistories,
        "unknown",
      ),
      equipment: record.equipment.map(({ label }) => label),
      images: record.images
        .toSorted((left, right) => left.position - right.position)
        .map((image) => ({
          url: image.url,
          alt: image.alt ?? undefined,
          position: image.position,
        })),
      publishedAt: record.publishedAt?.toISOString(),
      observedAt: record.synchronizedAt.toISOString(),
    },
    analysis,
  };
}

export interface VehicleListingCatalog {
  listings: readonly VehicleSearchResult[];
  lastSynchronizedAt?: string;
  availableFilters: {
    brands: readonly string[];
    models: readonly string[];
    priceRange: { minimum: number; maximum: number };
  };
  pagination: {
    page: number;
    pageSize: number;
    totalListings: number;
    totalPages: number;
  };
}

const vehicleListingPageSize = 60;

function buildListingWhere(filters: SearchFilters): Prisma.ListingRecordWhereInput {
  const priceFilter: Prisma.IntFilter = {};
  if (filters.minPrice !== null) priceFilter.gte = filters.minPrice;
  if (filters.maxPrice !== null) priceFilter.lte = filters.maxPrice;

  const vehicleFilter: Prisma.VehicleRecordWhereInput = {};
  if (filters.brand) vehicleFilter.make = filters.brand;
  if (filters.model) vehicleFilter.model = filters.model;
  if (filters.fuelType) vehicleFilter.fuelType = filters.fuelType;
  if (filters.transmission) vehicleFilter.transmission = filters.transmission;
  if (filters.minYear !== null) vehicleFilter.modelYear = { gte: filters.minYear };
  if (filters.bodyStyle) vehicleFilter.bodyStyle = filters.bodyStyle;

  const query = filters.query.trim();

  return {
    status: "active",
    ...(Object.keys(priceFilter).length > 0 ? { priceAmount: priceFilter } : {}),
    ...(filters.maxMileageMil !== null
      ? { mileageKm: { lte: filters.maxMileageMil * 10 } }
      : {}),
    ...(Object.keys(vehicleFilter).length > 0 ? { vehicle: { is: vehicleFilter } } : {}),
    ...(query
      ? {
          OR: [
            { sellerName: { contains: query } },
            { vehicle: { is: { make: { contains: query } } } },
            { vehicle: { is: { model: { contains: query } } } },
            { vehicle: { is: { variant: { contains: query } } } },
          ],
        }
      : {}),
  };
}

function listingOrder(sort: SearchSort): Prisma.ListingRecordOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceAmount: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceAmount: "desc" }, { id: "asc" }];
    case "newest":
      return [{ vehicle: { modelYear: "desc" } }, { publishedAt: "desc" }, { id: "asc" }];
    case "buy_confidence":
    case "deal_score":
    default:
      return [{ publishedAt: "desc" }, { synchronizedAt: "desc" }, { id: "asc" }];
  }
}

export async function getActiveVehicleListings(
  options: VehicleSearchOptions,
): Promise<VehicleListingCatalog> {
  const where = buildListingWhere(options.filters);
  const totalListings = await prisma.listingRecord.count({
    where,
  });
  const totalPages = Math.max(1, Math.ceil(totalListings / vehicleListingPageSize));
  const page = Math.min(Math.max(1, Math.trunc(options.page)), totalPages);
  const [records, brands, models, priceRange, synchronization] = await Promise.all([
    prisma.listingRecord.findMany({
      where,
      include: { vehicle: true, images: true, equipment: true },
      orderBy: listingOrder(options.sort),
      skip: (page - 1) * vehicleListingPageSize,
      take: vehicleListingPageSize,
    }),
    prisma.vehicleRecord.findMany({
      where: { listings: { some: { status: "active" } } },
      distinct: ["make"],
      orderBy: { make: "asc" },
      select: { make: true },
    }),
    prisma.vehicleRecord.findMany({
      where: {
        ...(options.filters.brand ? { make: options.filters.brand } : {}),
        listings: { some: { status: "active" } },
      },
      distinct: ["model"],
      orderBy: { model: "asc" },
      select: { model: true },
    }),
    prisma.listingRecord.aggregate({
      where: { status: "active" },
      _min: { priceAmount: true },
      _max: { priceAmount: true },
    }),
    prisma.listingRecord.aggregate({
      where: { status: "active" },
      _max: { synchronizedAt: true },
    }),
  ]);
  const baseResults = records.map(mapStoredListing);
  const benchmarks = buildVehicleInsightBenchmarks(baseResults);
  const listings = baseResults.map((result) => ({
    ...result,
    analysis: {
      ...result.analysis,
      insights: generateVehicleInsights(result, benchmarks),
    },
  }));

  return {
    listings,
    lastSynchronizedAt: synchronization._max.synchronizedAt?.toISOString(),
    availableFilters: {
      brands: brands.map(({ make }) => make),
      models: models.map(({ model }) => model),
      priceRange: {
        minimum: priceRange._min.priceAmount ?? 0,
        maximum: priceRange._max.priceAmount ?? 0,
      },
    },
    pagination: {
      page,
      pageSize: vehicleListingPageSize,
      totalListings,
      totalPages,
    },
  };
}
