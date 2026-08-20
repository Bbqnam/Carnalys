import "server-only";

import type {
  AnalysisConfidence,
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
  AvailableVehicleFilters,
  SearchFilters,
  SearchSort,
  VehiclePageSize,
  VehicleSearchOptions,
  VehicleSearchResult,
} from "@/features/search/types";
import { Prisma } from "@/generated/prisma/client";
import { getPreparedCatalogFilters } from "./catalog-facet-repository";
import { initializeDatabase, prisma } from "./prisma";

const storedListingSelect = {
  id: true,
  vehicleId: true,
  provider: true,
  externalId: true,
  listingUrl: true,
  firstSeenAt: true,
  lastSeenAt: true,
  sellerName: true,
  sellerType: true,
  priceAmount: true,
  previousPriceAmount: true,
  monthlyCostAmount: true,
  municipality: true,
  latitude: true,
  longitude: true,
  description: true,
  mileageKm: true,
  serviceHistory: true,
  publishedAt: true,
  synchronizedAt: true,
  vehicle: {
    select: {
      id: true,
      make: true,
      model: true,
      variant: true,
      modelYear: true,
      registrationYear: true,
      bodyStyle: true,
      fuelType: true,
      transmission: true,
      drivetrain: true,
      horsepower: true,
      engineDescription: true,
      engineDisplacement: true,
      registrationNumber: true,
      vin: true,
      firstRegistration: true,
    },
  },
  images: {
    select: { url: true, alt: true, position: true },
    orderBy: { position: "asc" as const },
  },
  equipment: {
    select: { label: true },
  },
  analysis: {
    select: {
      marketValueAmount: true,
      marketValueMinimum: true,
      marketValueMaximum: true,
      comparableCount: true,
      confidence: true,
      dealScore: true,
      buyConfidenceScore: true,
      annualOwnershipCost: true,
      methodologyVersion: true,
      calculatedAt: true,
    },
  },
} satisfies Prisma.ListingRecordSelect;

type StoredListing = Prisma.ListingRecordGetPayload<{
  select: typeof storedListingSelect;
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
const analysisConfidences = new Set<AnalysisConfidence>([
  "low",
  "medium",
  "high",
]);

function enumValue<T extends string>(
  value: string | null,
  values: Set<T>,
  fallback: T,
) {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function roundedThousands(value: number) {
  return Math.max(1_000, Math.round(value / 1_000) * 1_000);
}

function createStoredAnalysis(
  result: StoredListing,
): VehicleSearchResult["analysis"] {
  const stored = result.analysis;
  const askingPrice = result.priceAmount;
  const confidence = enumValue(
    stored?.confidence ?? null,
    analysisConfidences,
    "low",
  );
  const comparableCount = stored?.comparableCount ?? 0;

  return {
    vehicleId: result.vehicleId,
    listingId: result.id,
    methodologyVersion: stored?.methodologyVersion ?? "stored-neutral-1.0",
    calculatedAt: (
      stored?.calculatedAt ?? result.synchronizedAt
    ).toISOString(),
    marketValue: {
      value: {
        amount: stored?.marketValueAmount ?? askingPrice,
        currency: "SEK",
      },
      range: {
        minimum: {
          amount:
            stored?.marketValueMinimum ??
            roundedThousands(askingPrice * 0.9),
          currency: "SEK",
        },
        maximum: {
          amount:
            stored?.marketValueMaximum ??
            roundedThousands(askingPrice * 1.1),
          currency: "SEK",
        },
      },
      confidence,
      comparableListingCount: comparableCount,
      explanation:
        comparableCount >= 3
          ? `Medianpris från ${comparableCount} jämförbara aktiva annonser.`
          : "För få jämförbara annonser; värderingen visas neutralt.",
    },
    ownershipCost: {
      annualCost: {
        amount:
          stored?.annualOwnershipCost ??
          Math.round(34_000 + askingPrice * 0.065),
        currency: "SEK",
      },
      estimatedForAnnualDistanceKm: 15_000,
      confidence: "low",
      items: [],
      assumptions: ["1 500 mil per år", "Tillfällig kostnadsmodell"],
    },
    dealScore: {
      kind: "deal",
      value: stored?.dealScore ?? 70,
      confidence,
      summary:
        comparableCount >= 3
          ? "Priset jämförs med liknande aktiva annonser."
          : "För få jämförbara annonser för en säker prisbedömning.",
      factors: [],
    },
    buyConfidenceScore: {
      kind: "buy_confidence",
      value: stored?.buyConfidenceScore ?? 70,
      confidence,
      summary: "Sparad bedömning baserad på tillgänglig annonsdata.",
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
        latitude: record.latitude ?? undefined,
        longitude: record.longitude ?? undefined,
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
      images: record.images.map((image) => ({
        url: image.url,
        alt: image.alt ?? undefined,
        position: image.position,
      })),
      publishedAt: record.publishedAt?.toISOString(),
      observedAt: record.synchronizedAt.toISOString(),
    },
    analysis: createStoredAnalysis(record),
  };
}

export interface VehicleListingCatalog {
  listings: readonly VehicleSearchResult[];
  lastSynchronizedAt?: string;
  availableFilters: AvailableVehicleFilters;
  pagination: {
    page: number;
    pageSize: VehiclePageSize;
    totalListings: number;
    totalPages: number;
  };
}

function buildListingWhere(
  filters: SearchFilters,
): Prisma.ListingRecordWhereInput {
  const priceFilter: Prisma.IntFilter = {};
  if (filters.minPrice !== null) priceFilter.gte = filters.minPrice;
  if (filters.maxPrice !== null) priceFilter.lte = filters.maxPrice;

  const vehicleFilter: Prisma.VehicleRecordWhereInput = {};
  if (filters.brands.length > 0)
    vehicleFilter.make = { in: [...filters.brands] };
  if (filters.models.length > 0)
    vehicleFilter.model = { in: [...filters.models] };
  if (filters.fuelType) vehicleFilter.fuelType = filters.fuelType;
  if (filters.transmission)
    vehicleFilter.transmission = filters.transmission;
  if (filters.minYear !== null || filters.maxYear !== null) {
    vehicleFilter.modelYear = {
      ...(filters.minYear !== null ? { gte: filters.minYear } : {}),
      ...(filters.maxYear !== null ? { lte: filters.maxYear } : {}),
    };
  }
  if (filters.bodyStyle) vehicleFilter.bodyStyle = filters.bodyStyle;

  const query = filters.query.trim();

  return {
    status: "active",
    ...(Object.keys(priceFilter).length > 0
      ? { priceAmount: priceFilter }
      : {}),
    ...(filters.minMileageMil !== null || filters.maxMileageMil !== null
      ? {
          mileageKm: {
            ...(filters.minMileageMil !== null
              ? { gte: filters.minMileageMil * 10 }
              : {}),
            ...(filters.maxMileageMil !== null
              ? { lte: filters.maxMileageMil * 10 }
              : {}),
          },
        }
      : {}),
    ...(Object.keys(vehicleFilter).length > 0
      ? { vehicle: { is: vehicleFilter } }
      : {}),
    ...(query
      ? {
          OR: [
            { sellerName: { contains: query, mode: "insensitive" } },
            { vehicle: { is: { make: { contains: query, mode: "insensitive" } } } },
            { vehicle: { is: { model: { contains: query, mode: "insensitive" } } } },
            { vehicle: { is: { variant: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

function listingOrder(
  sort: SearchSort,
): Prisma.ListingRecordOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ priceAmount: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceAmount: "desc" }, { id: "asc" }];
    case "newest":
      return [
        { publishedAt: "desc" },
        { synchronizedAt: "desc" },
        { id: "asc" },
      ];
    case "buy_confidence":
      return [{ analysis: { buyConfidenceScore: "desc" } }, { id: "asc" }];
    case "deal_score":
    default:
      return [{ analysis: { dealScore: "desc" } }, { id: "asc" }];
  }
}

export async function getActiveVehicleListings(
  options: VehicleSearchOptions,
): Promise<VehicleListingCatalog> {
  await initializeDatabase();
  const where = buildListingWhere(options.filters);
  const pageSize = options.pageSize;
  const totalListings = await prisma.listingRecord.count({ where });
  const totalPages = Math.max(
    1,
    Math.ceil(totalListings / pageSize),
  );
  const page = Math.min(Math.max(1, Math.trunc(options.page)), totalPages);
  const [records, preparedCatalog] = await Promise.all([
    prisma.listingRecord.findMany({
      where,
      select: storedListingSelect,
      orderBy: listingOrder(options.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    getPreparedCatalogFilters(options.filters.brands),
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
    lastSynchronizedAt: preparedCatalog.lastSynchronizedAt,
    availableFilters: preparedCatalog.filters,
    pagination: {
      page,
      pageSize,
      totalListings,
      totalPages,
    },
  };
}
