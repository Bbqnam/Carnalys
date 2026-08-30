import "server-only";

import type {
  AnalysisConfidence,
  BodyStyle,
  Drivetrain,
  FuelType,
  ListingStatus,
  ScoreFactor,
  ServiceHistoryStatus,
  TransmissionType,
  VehicleSpecification,
} from "@/domain/vehicle";
import {
  buildVehicleInsightBenchmarks,
  estimateOwnershipCost,
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
  title: true,
  listingUrl: true,
  firstSeenAt: true,
  lastSeenAt: true,
  sellerName: true,
  sellerType: true,
  status: true,
  priceAmount: true,
  previousPriceAmount: true,
  monthlyCostAmount: true,
  municipality: true,
  latitude: true,
  longitude: true,
  description: true,
  mileageKm: true,
  serviceHistory: true,
  ownerCount: true,
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
      fuelConsumption: true,
      registrationNumber: true,
      vin: true,
      firstRegistration: true,
      listings: {
        where: { status: "active" },
        select: {
          id: true,
          provider: true,
          listingUrl: true,
          title: true,
        },
        orderBy: [{ synchronizedAt: "desc" as const }, { id: "asc" as const }],
      },
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
      comparablePrices: true,
      confidence: true,
      dealScore: true,
      dealScoreFactors: true,
      buyConfidenceScore: true,
      buyConfidenceFactors: true,
      annualOwnershipCost: true,
      ownershipCostItems: true,
      methodologyVersion: true,
      calculatedAt: true,
    },
  },
} satisfies Prisma.ListingRecordSelect;

/**
 * What a result card actually draws.
 *
 * The grid was selecting — and serialising to the browser — the shape built for
 * the detail page: every equipment line, every image, the comparable-price
 * array, both factor lists and the ownership-cost breakdown, thirty-five times
 * over. Measured on the running page that was 585 KB of HTML for one screen of
 * results, of which 199 KB was payload for fields no card renders.
 *
 * A card needs one image, the identity, the price, the seller, and two score
 * values. The detail page keeps `storedListingSelect` and the full shape.
 */
const cardListingSelect = {
  id: true,
  vehicleId: true,
  provider: true,
  externalId: true,
  title: true,
  listingUrl: true,
  firstSeenAt: true,
  lastSeenAt: true,
  sellerName: true,
  sellerType: true,
  status: true,
  priceAmount: true,
  previousPriceAmount: true,
  monthlyCostAmount: true,
  municipality: true,
  latitude: true,
  longitude: true,
  mileageKm: true,
  serviceHistory: true,
  ownerCount: true,
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
      engineDisplacement: true,
      fuelConsumption: true,
    },
  },
  // The card shows the first image and nothing else opens a gallery from here.
  images: {
    select: { url: true, alt: true, position: true },
    orderBy: { position: "asc" as const },
    take: 1,
  },
  analysis: {
    select: {
      marketValueAmount: true,
      marketValueMinimum: true,
      marketValueMaximum: true,
      comparableCount: true,
      confidence: true,
      dealScore: true,
      // Kept because the results page sorts on it client-side; the factor
      // lists behind both scores are detail-page material.
      buyConfidenceScore: true,
      annualOwnershipCost: true,
      methodologyVersion: true,
      calculatedAt: true,
    },
  },
} satisfies Prisma.ListingRecordSelect;

type CardListing = Prisma.ListingRecordGetPayload<{
  select: typeof cardListingSelect;
}>;

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
const listingStatuses = new Set<ListingStatus>([
  "active",
  "reserved",
  "sold",
  "removed",
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
  result: StoredListing | CardListing,
  specification: VehicleSpecification,
  itemised: boolean,
): VehicleSearchResult["analysis"] {
  const stored = result.analysis;
  // The card select omits the three JSON columns behind the scores; they read
  // as absent rather than as a separate branch.
  const narrow = (stored ?? {}) as Partial<
    NonNullable<StoredListing["analysis"]>
  >;
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
      comparablePrices: narrow.comparablePrices ?? [],
      explanation:
        comparableCount >= 3
          ? `Medianpris från ${comparableCount} jämförbara aktiva annonser.`
          : "För få jämförbara annonser; värderingen visas neutralt.",
    },
    // Ownership cost depends only on this one car's own price, age and
    // powertrain — never on other listings — so it is computed live here for
    // both the card and the detail page (one formula, no drift), and read from
    // no stored column. The card gets the total only; the itemised breakdown is
    // built solely for the caller that will render it.
    ownershipCost: (() => {
      const full = estimateOwnershipCost(
        specification,
        askingPrice,
        result.vehicle.modelYear,
      );
      return itemised ? full : { ...full, items: [], assumptions: [] };
    })(),
    dealScore: {
      kind: "deal",
      // `null` = unrated (no comparable value, or the price was quarantined).
      // Never coerced to a number — the UI must show "not rated", not 50.
      value: stored?.dealScore ?? null,
      confidence,
      summary:
        stored?.dealScore == null
          ? "Priset kunde inte bedömas mot marknaden."
          : comparableCount >= 3
            ? "Priset jämförs med liknande aktiva annonser."
            : "För få jämförbara annonser för en säker prisbedömning.",
      factors: (narrow.dealScoreFactors as ScoreFactor[] | undefined) ?? [],
    },
    buyConfidenceScore: {
      kind: "buy_confidence",
      value: stored?.buyConfidenceScore ?? 50,
      confidence,
      summary: "Sparad bedömning baserad på tillgänglig annonsdata.",
      factors:
        (narrow.buyConfidenceFactors as ScoreFactor[] | undefined) ?? [],
    },
    insights: [],
  };
}

/**
 * Accepts either shape. The card select omits the fields only the detail page
 * draws, so everything it leaves out reads as absent here rather than as a
 * different code path — one mapper, two payload widths.
 */
function mapStoredListing(
  record: StoredListing | CardListing,
  { itemisedOwnershipCost = true }: { itemisedOwnershipCost?: boolean } = {},
): VehicleSearchResult {
  const detail = record as Partial<StoredListing>;
  const detailVehicle = record.vehicle as Partial<StoredListing["vehicle"]>;
  const bodyStyle = enumValue(record.vehicle.bodyStyle, bodyStyles, "other");
  const fuelType = enumValue(record.vehicle.fuelType, fuelTypes, "other");
  const transmission = enumValue(
    record.vehicle.transmission,
    transmissions,
    "other",
  );
  const specification: VehicleSpecification = {
    bodyStyle,
    powertrain: {
      fuelType,
      transmission,
      drivetrain: record.vehicle.drivetrain
        ? enumValue(record.vehicle.drivetrain, drivetrains, "other")
        : undefined,
      powerHp: record.vehicle.horsepower ?? undefined,
      engineDisplacementCc: record.vehicle.engineDisplacement ?? undefined,
      engineDescription: detailVehicle.engineDescription ?? undefined,
      fuelConsumption: record.vehicle.fuelConsumption ?? undefined,
    },
  };

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
      specification,
      registrationNumber: detailVehicle.registrationNumber ?? undefined,
      vin: detailVehicle.vin ?? undefined,
      firstRegistrationDate: detailVehicle.firstRegistration
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
        synchronizedAt: record.synchronizedAt.toISOString(),
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
      status: enumValue(record.status, listingStatuses, "active"),
      title: detail.title ?? `${record.vehicle.make} ${record.vehicle.model} ${record.vehicle.variant ?? ""}`.trim(),
      description: detail.description ?? undefined,
      mileageKm: record.mileageKm,
      serviceHistory: enumValue(
        record.serviceHistory,
        serviceHistories,
        "unknown",
      ),
      ownerCount: record.ownerCount ?? undefined,
      equipment: detail.equipment?.map(({ label }) => label) ?? [],
      images: record.images.map((image) => ({
        url: image.url,
        alt: image.alt ?? undefined,
        position: image.position,
      })),
      publishedAt: record.publishedAt?.toISOString(),
      observedAt: record.synchronizedAt.toISOString(),
    },
    analysis: createStoredAnalysis(record, specification, itemisedOwnershipCost),
    relatedSourceListings: detailVehicle.listings
      ?.filter(
        (listing) =>
          listing.id !== record.id &&
          listing.provider !== record.provider,
      )
      .map((listing) => ({
        id: listing.id,
        provider: listing.provider,
        url: listing.listingUrl,
        title: listing.title ?? undefined,
      })),
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

function postedWithinCutoff(value: "today" | "week" | "month"): Date {
  const dayInMs = 24 * 60 * 60 * 1000;
  switch (value) {
    case "today":
      return new Date(Date.now() - dayInMs);
    case "week":
      return new Date(Date.now() - 7 * dayInMs);
    case "month":
      return new Date(Date.now() - 30 * dayInMs);
  }
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

  const queryTokens = filters.query.trim().split(/\s+/).filter(Boolean);

  // Every token is answered by the listing's own `searchText`, which already
  // holds make, model, variant and seller lowercased. The previous shape — an
  // OR across the vehicle relation per token — made Prisma join VehicleRecord
  // three times per token and stranded the predicates on separate join
  // aliases, so the trigram indexes could not be used and Postgres scanned the
  // whole catalogue. Lowercasing the token lets this stay a plain `contains`
  // (LIKE) rather than `mode: "insensitive"` (ILIKE), which is what the GIN
  // trigram index on the column is built for.
  const andConditions: Prisma.ListingRecordWhereInput[] = queryTokens.map((token) => ({
    searchText: { contains: token.toLowerCase() },
  }));

  if (filters.postedWithin) {
    const cutoff = postedWithinCutoff(filters.postedWithin);
    // `listedAt` already resolves publish-date-less ads to their first-seen
    // instant, so this is a single comparison instead of an OR.
    andConditions.push({ listedAt: { gte: cutoff } });
  }

  return {
    status: "active",
    // One card per physical vehicle. Skipped when the user has narrowed to
    // specific sources — then they want every listing from those sources, and
    // the representative (which may belong to a source they filtered out)
    // would hide real matches.
    ...(filters.sources.length > 0
      ? { provider: { in: [...filters.sources] } }
      : { isVehicleRepresentative: true }),
    ...(filters.sellerType ? { sellerType: filters.sellerType } : {}),
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
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
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
      // `listedAt` = source publish time, or first-seen when the source gives
      // none. Ordering on `publishedAt` alone sent every publish-date-less ad
      // (Hedin, older Bytbil) to the top on a DESC sort's NULLs-first rule.
      return [{ listedAt: "desc" }, { id: "asc" }];
    case "buy_confidence":
      return [{ analysis: { buyConfidenceScore: "desc" } }, { id: "asc" }];
    case "deal_score":
    default:
      // Unrated listings (dealScore IS NULL) sort last, not first — a missing
      // score is not the best deal on the page.
      return [
        { analysis: { dealScore: { sort: "desc", nulls: "last" } } },
        { id: "asc" },
      ];
  }
}

export async function getActiveVehicleListings(
  options: VehicleSearchOptions,
): Promise<VehicleListingCatalog> {
  await initializeDatabase();
  const where = buildListingWhere(options.filters);
  const pageSize = options.pageSize;
  // The count only clamps the page, and the facets do not depend on it at all,
  // so all three go out together and the page is clamped once they are back.
  // Awaiting the count first put its latency in front of every search — worst
  // on the queries where the count is slowest.
  const requestedPage = Math.max(1, Math.trunc(options.page));
  const [totalListings, records, preparedCatalog] = await Promise.all([
    prisma.listingRecord.count({ where }),
    prisma.listingRecord.findMany({
      where,
      select: cardListingSelect,
      orderBy: listingOrder(options.sort),
      skip: (requestedPage - 1) * pageSize,
      take: pageSize,
    }),
    getPreparedCatalogFilters(options.filters.brands),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalListings / pageSize));
  const page = Math.min(requestedPage, totalPages);
  // No insights here. `generateVehicleInsights` runs the full rule set per
  // listing and its output is serialised to the browser for every card — and
  // nothing in the interface renders it. Building the benchmarks it needs
  // meant a pass over the page's listings as well.
  const listings = records.map((record) =>
    mapStoredListing(record, { itemisedOwnershipCost: false }),
  );

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

/** Just enough of a listing to title a page; deliberately avoids the
 *  comparables and analysis work that `getListingById` does. */
export interface ListingSummary {
  make: string;
  model: string;
  variant?: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
  municipality: string;
  /** First gallery image — the social/link-preview thumbnail. */
  imageUrl?: string;
}

export async function getListingSummaryById(
  listingId: string,
): Promise<ListingSummary | null> {
  await initializeDatabase();
  const record = await prisma.listingRecord.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      mileageKm: true,
      priceAmount: true,
      municipality: true,
      images: {
        select: { url: true },
        orderBy: { position: "asc" },
        take: 1,
      },
      vehicle: {
        select: { make: true, model: true, variant: true, modelYear: true },
      },
    },
  });
  if (!record || record.status !== "active") return null;

  return {
    make: record.vehicle.make,
    model: record.vehicle.model,
    variant: record.vehicle.variant ?? undefined,
    modelYear: record.vehicle.modelYear,
    mileageKm: record.mileageKm,
    priceAmount: record.priceAmount,
    municipality: record.municipality,
    imageUrl: record.images[0]?.url,
  };
}

export async function getListingById(
  listingId: string,
): Promise<VehicleSearchResult | null> {
  await initializeDatabase();
  const record = await prisma.listingRecord.findUnique({
    where: { id: listingId },
    select: storedListingSelect,
  });
  if (!record || record.status !== "active") return null;

  const target = mapStoredListing(record);
  const comparableRecords = await prisma.listingRecord.findMany({
    where: {
      status: "active",
      vehicle: {
        is: { make: record.vehicle.make, model: record.vehicle.model },
      },
    },
    select: storedListingSelect,
    take: 50,
  });
  const comparables = comparableRecords.map((record) => mapStoredListing(record));
  const benchmarkSource = comparables.some(
    (result) => result.listing.id === target.listing.id,
  )
    ? comparables
    : [...comparables, target];
  const benchmarks = buildVehicleInsightBenchmarks(benchmarkSource);

  return {
    ...target,
    analysis: {
      ...target.analysis,
      insights: generateVehicleInsights(target, benchmarks),
    },
  };
}

export async function getListingsByIds(
  listingIds: readonly string[],
): Promise<VehicleSearchResult[]> {
  await initializeDatabase();
  if (listingIds.length === 0) return [];

  const records = await prisma.listingRecord.findMany({
    where: { id: { in: [...listingIds] }, status: "active" },
    select: storedListingSelect,
  });
  const baseResults = records.map((record) => mapStoredListing(record));
  const benchmarks = buildVehicleInsightBenchmarks(baseResults);

  // `id: { in: [...] }` doesn't preserve input order, but callers (compare
  // table columns, saved-list ordering) rely on getting results back in the
  // order they asked for.
  const orderById = new Map(listingIds.map((id, index) => [id, index]));
  const results = baseResults.map((result) => ({
    ...result,
    analysis: {
      ...result.analysis,
      insights: generateVehicleInsights(result, benchmarks),
    },
  }));
  results.sort(
    (a, b) =>
      orderById.get(a.listing.id)! - orderById.get(b.listing.id)!,
  );
  return results;
}

export async function getActiveListingCount(): Promise<number> {
  await initializeDatabase();
  return prisma.listingRecord.count({ where: { status: "active" } });
}
