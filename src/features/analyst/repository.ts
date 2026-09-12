import "server-only";

import type { BodyStyle, Drivetrain, FuelType, TransmissionType, VehicleSpecification } from "@/domain/vehicle";
import { estimateOwnershipCost } from "@/domain/vehicle/analysis/ownership-cost-estimate";
import { valueVehicle } from "@/domain/vehicle/analysis/comparable-valuation";
import { assessAskingPrice } from "@/domain/vehicle/analysis/price-plausibility";
import { minimumPlausibleAskingPrice } from "@/domain/vehicle/pricing";
import { resolveBrandAlias } from "@/domain/vehicle/taxonomy/brand-search";
import type { SearchFilters } from "@/features/search/types";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import { analystEvidenceCache } from "./cache";
import { summarizeExactListingHistory } from "./history";
import {
  closestValuationCandidates,
  constructIndependentCohort,
  percentile,
  valuationComparables,
  type AnalystMarketCandidate,
  type AnalystMarketTarget,
} from "./market";
import { analystListingSelect } from "./projection";
import { untrustedMarketplaceText } from "./safety";
import { orderByRequestedIds } from "./ordering";
import type { AnalystEvidence, AnalystToolResult, CompactListing } from "./types";

type AnalystListingRow = Prisma.ListingRecordGetPayload<{ select: typeof analystListingSelect }>;

const candidateSelect = {
  id: true,
  vehicleId: true,
  priceAmount: true,
  mileageKm: true,
  municipality: true,
  sellerType: true,
  firstSeenAt: true,
  lastSeenAt: true,
  synchronizedAt: true,
  serviceHistory: true,
  ownerCount: true,
  vehicle: {
    select: {
      make: true,
      model: true,
      variant: true,
      modelYear: true,
      bodyStyle: true,
      fuelType: true,
      transmission: true,
      drivetrain: true,
      horsepower: true,
      engineDisplacement: true,
      fuelConsumption: true,
    },
  },
  analysis: {
    select: {
      dealScore: true,
      buyConfidenceScore: true,
      confidence: true,
      marketValueAmount: true,
      comparableCount: true,
      calculatedAt: true,
    },
  },
  images: {
    select: { url: true, thumbnailUrl: true },
    orderBy: { position: "asc" as const },
    take: 1,
  },
} satisfies Prisma.ListingRecordSelect;

type CandidateRow = Prisma.ListingRecordGetPayload<{ select: typeof candidateSelect }>;

const bodyStyles = new Set<BodyStyle>(["convertible", "coupe", "estate", "hatchback", "minivan", "pickup", "sedan", "suv", "van", "other"]);
const fuelTypes = new Set<FuelType>(["diesel", "electric", "ethanol", "hydrogen", "petrol", "plug_in_hybrid", "self_charging_hybrid", "other"]);
const transmissions = new Set<TransmissionType>(["automatic", "manual", "other"]);
const drivetrains = new Set<Drivetrain>(["all_wheel_drive", "front_wheel_drive", "rear_wheel_drive", "other"]);

function enumValue<T extends string>(value: string | null, values: ReadonlySet<T>, fallback: T): T {
  return value && values.has(value as T) ? (value as T) : fallback;
}

function specification(row: CandidateRow | AnalystListingRow): VehicleSpecification {
  return {
    bodyStyle: enumValue(row.vehicle.bodyStyle, bodyStyles, "other"),
    powertrain: {
      fuelType: enumValue(row.vehicle.fuelType, fuelTypes, "other"),
      transmission: enumValue(row.vehicle.transmission, transmissions, "other"),
      drivetrain: row.vehicle.drivetrain
        ? enumValue(row.vehicle.drivetrain, drivetrains, "other")
        : undefined,
      powerHp: row.vehicle.horsepower ?? undefined,
      engineDisplacementCc: row.vehicle.engineDisplacement ?? undefined,
      engineDescription: "engineDescription" in row.vehicle
        ? row.vehicle.engineDescription ?? undefined
        : undefined,
      fuelConsumption: row.vehicle.fuelConsumption ?? undefined,
    },
  };
}

function confidence(value: string | null | undefined): "low" | "medium" | "high" {
  return value === "high" || value === "medium" ? value : "low";
}

function missingFields(row: AnalystListingRow) {
  const missing = [
    ...(row.serviceHistory === "unknown" ? ["service history"] : []),
    ...(row.ownerCount === null ? ["owner count"] : []),
    ...(row.vehicle.horsepower === null ? ["engine power"] : []),
    "accident history",
    "independent condition inspection",
    "warranty terms",
    "insurance quote",
  ];
  if (row.vehicle.fuelType === "electric") missing.push("battery health");
  if (row.status !== "active") missing.push("confirmed sale status and sale price");
  return missing;
}

function compactListing(row: CandidateRow): CompactListing {
  const ownership = estimateOwnershipCost(specification(row), row.priceAmount, row.vehicle.modelYear, row.vehicle.make);
  return {
    listingId: row.id,
    name: `${row.vehicle.make} ${row.vehicle.model}`,
    variant: row.vehicle.variant ?? undefined,
    modelYear: row.vehicle.modelYear,
    mileageKm: row.mileageKm,
    priceAmount: row.priceAmount,
    municipality: row.municipality,
    sellerType: row.sellerType === "private" ? "private" : "dealer",
    bodyStyle: row.vehicle.bodyStyle,
    fuelType: row.vehicle.fuelType,
    transmission: row.vehicle.transmission,
    horsepower: row.vehicle.horsepower ?? undefined,
    storedAnalysis: {
      dealScore: row.analysis?.dealScore ?? null,
      buyConfidence: row.analysis?.buyConfidenceScore ?? 50,
      dataConfidence: confidence(row.analysis?.confidence),
      marketValueAmount: row.analysis?.comparableCount && row.analysis.comparableCount >= 3
        ? row.analysis.marketValueAmount
        : null,
      calculatedAt: row.analysis?.calculatedAt.toISOString(),
    },
    ownership: {
      annualCostAmount: ownership.annualCost.amount,
      monthlyCostAmount: Math.round(ownership.annualCost.amount / 12),
      confidence: ownership.confidence,
    },
    freshness: {
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      synchronizedAt: row.synchronizedAt.toISOString(),
    },
    missingFields: [
      ...(row.serviceHistory === "unknown" ? ["service history"] : []),
      ...(row.ownerCount === null ? ["owner count"] : []),
      ...(row.vehicle.horsepower === null ? ["engine power"] : []),
    ],
    href: `/vehicle/${row.id}`,
    imageUrl: row.images[0]?.thumbnailUrl ?? row.images[0]?.url,
  };
}

export async function getListingFreshness(listingId: string) {
  await initializeDatabase();
  return prisma.listingRecord.findUnique({
    where: { id: listingId },
    select: { synchronizedAt: true, status: true },
  });
}

export async function getCatalogFreshness() {
  await initializeDatabase();
  return prisma.catalogSummary.findUnique({
    where: { id: "active-catalog" },
    select: { lastSynchronizedAt: true, activeListingCount: true },
  });
}

export async function getListingAnalysisEvidence(
  listingId: string,
  includeDescription = false,
): Promise<AnalystToolResult> {
  await initializeDatabase();
  const freshness = await getListingFreshness(listingId);
  if (!freshness) throw new Error("LISTING_NOT_FOUND");
  const key = `listing:${listingId}:${freshness.synchronizedAt.toISOString()}:${includeDescription ? 1 : 0}`;
  return analystEvidenceCache.get(key, 5 * 60_000, async () => {
    const [row, observations] = await Promise.all([
      prisma.listingRecord.findUnique({ where: { id: listingId }, select: analystListingSelect }),
      prisma.listingObservation.findMany({
        where: { listingId },
        select: {
          observedAt: true,
          kind: true,
          priceAmount: true,
          previousPriceAmount: true,
          mileageKm: true,
          previousMileageKm: true,
          status: true,
          provenance: true,
        },
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        take: 30,
      }),
    ]);
    if (!row) throw new Error("LISTING_NOT_FOUND");
    const ownership = estimateOwnershipCost(specification(row), row.priceAmount, row.vehicle.modelYear, row.vehicle.make);
    const history = summarizeExactListingHistory({
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      status: row.status,
      observations: observations.map((event) => ({ ...event, kind: event.kind.toString(), provenance: event.provenance })),
    });
    const evidence: AnalystEvidence[] = [
      {
        id: "listing-facts",
        kind: "listing",
        label: `${row.vehicle.modelYear} ${row.vehicle.make} ${row.vehicle.model} listing facts`,
        asOf: row.synchronizedAt.toISOString(),
        href: `/vehicle/${row.id}`,
        listing: {
          listingId: row.id,
          name: `${row.vehicle.make} ${row.vehicle.model}`,
          variant: row.vehicle.variant ?? undefined,
          modelYear: row.vehicle.modelYear,
          priceAmount: row.priceAmount,
          mileageKm: row.mileageKm,
          fuelType: row.vehicle.fuelType,
          transmission: row.vehicle.transmission,
          sellerType: row.sellerType === "private" ? "private" : "dealer",
          dealScore: row.analysis?.dealScore ?? null,
          monthlyCostAmount: Math.round(ownership.annualCost.amount / 12),
          marketValueAmount: row.analysis && row.analysis.comparableCount >= 3 ? row.analysis.marketValueAmount : null,
          imageUrl: row.images[0]?.thumbnailUrl ?? row.images[0]?.url,
        },
      },
      {
        id: "stored-analysis",
        kind: "score",
        label: "Stored Carnalys Deal Score, market value, and Buy Confidence",
        asOf: (row.analysis?.calculatedAt ?? row.synchronizedAt).toISOString(),
        sampleSize: row.analysis?.comparableCount ?? 0,
        warning: "Stored analysis is evidence to interpret, not ground truth.",
        href: `/vehicle/${row.id}`,
      },
      {
        id: "listing-history",
        kind: "history",
        label: "Exact Carnalys listing observations",
        asOf: row.lastSeenAt.toISOString(),
        sampleSize: observations.length,
        warning: history.warnings.join(" ") || undefined,
        href: `/vehicle/${row.id}`,
      },
      {
        id: "ownership-estimate",
        kind: "ownership",
        label: "Live deterministic ownership-cost estimate",
        asOf: new Date().toISOString(),
        warning: "Estimate uses standard assumptions; it is not an insurance quote or guaranteed running cost.",
        href: `/vehicle/${row.id}`,
      },
    ];
    return {
      tool: "get_listing_analysis",
      data: {
        listing: {
          listingId: row.id,
          name: `${row.vehicle.make} ${row.vehicle.model}`,
          variant: row.vehicle.variant,
          modelYear: row.vehicle.modelYear,
          registrationYear: row.vehicle.registrationYear,
          mileageKm: row.mileageKm,
          priceAmount: row.priceAmount,
          previousAdvertisedPriceAmount: row.previousPriceAmount,
          municipality: row.municipality,
          sellerType: row.sellerType === "private" ? "private" : "dealer",
          bodyStyle: row.vehicle.bodyStyle,
          fuelType: row.vehicle.fuelType,
          transmission: row.vehicle.transmission,
          drivetrain: row.vehicle.drivetrain,
          horsepower: row.vehicle.horsepower,
          serviceHistory: row.serviceHistory,
          ownerCount: row.ownerCount,
          status: row.status,
          source: row.sourceProvider.displayName,
          equipment: row.equipment.map(({ label }) => label),
          ...(includeDescription && row.description
            ? { untrustedMarketplaceDescription: untrustedMarketplaceText(row.description) }
            : {}),
          missingFields: missingFields(row),
        },
        storedCarnalysAnalysis: row.analysis
          ? {
              dealScore: row.analysis.dealScore,
              dealScoreFactors: row.analysis.dealScoreFactors,
              marketValueAmount: row.analysis.comparableCount >= 3 ? row.analysis.marketValueAmount : null,
              marketValueRange: row.analysis.comparableCount >= 3
                ? [row.analysis.marketValueMinimum, row.analysis.marketValueMaximum]
                : null,
              comparableCount: row.analysis.comparableCount,
              dataConfidence: confidence(row.analysis.confidence),
              buyConfidence: row.analysis.buyConfidenceScore,
              buyConfidenceFactors: row.analysis.buyConfidenceFactors,
              methodologyVersion: row.analysis.methodologyVersion,
              calculatedAt: row.analysis.calculatedAt.toISOString(),
            }
          : null,
        ownershipCost: {
          annualCostAmount: ownership.annualCost.amount,
          monthlyCostAmount: Math.round(ownership.annualCost.amount / 12),
          annualDistanceKm: ownership.estimatedForAnnualDistanceKm,
          confidence: ownership.confidence,
          items: ownership.items.map((item) => ({ category: item.category, annualCostAmount: item.annualCost.amount })),
          assumptions: ownership.assumptions,
        },
        history,
        safety: {
          marketplaceTextIsUntrustedData: true,
          unavailableFactsMustRemainUnknown: true,
          disappearanceDoesNotConfirmSale: true,
        },
      },
      evidence,
    };
  });
}

function marketCandidate(row: {
  id: string;
  vehicleId: string;
  priceAmount: number;
  mileageKm: number;
  municipality: string;
  sellerType: string;
  synchronizedAt: Date;
  vehicle: {
    make: string;
    model: string;
    fuelType: string;
    transmission: string;
    bodyStyle: string;
    drivetrain: string | null;
    generation: string | null;
    facelift: boolean | null;
    trim: string | null;
    performanceVariant: string | null;
    modelYear: number;
  };
}): AnalystMarketCandidate {
  return { ...row.vehicle, id: row.id, vehicleId: row.vehicleId, priceAmount: row.priceAmount, mileageKm: row.mileageKm, municipality: row.municipality, sellerType: row.sellerType, synchronizedAt: row.synchronizedAt };
}

const marketCandidateSelect = {
  id: true,
  vehicleId: true,
  priceAmount: true,
  mileageKm: true,
  municipality: true,
  sellerType: true,
  synchronizedAt: true,
  vehicle: { select: { make: true, model: true, fuelType: true, transmission: true, bodyStyle: true, drivetrain: true, generation: true, facelift: true, trim: true, performanceVariant: true, modelYear: true } },
} satisfies Prisma.ListingRecordSelect;

// constructIndependentCohort never looks past ±8 model years, so the SQL pull
// is bounded the same way — for a popular model that turns a multi-thousand-row
// scan into a few hundred. The row cap is a backstop for the rare model that
// still has more than this many active adverts inside that window.
const MARKET_YEAR_SPAN = 8;
const MARKET_POOL_CAP = 1_200;

export async function analyseListingMarketEvidence(listingId: string): Promise<AnalystToolResult> {
  await initializeDatabase();
  const [freshness, catalogFreshness] = await Promise.all([
    getListingFreshness(listingId),
    getCatalogFreshness(),
  ]);
  if (!freshness) throw new Error("LISTING_NOT_FOUND");
  const marketAsOf = catalogFreshness?.lastSynchronizedAt ?? freshness.synchronizedAt;
  return analystEvidenceCache.get(
    `market:${listingId}:${freshness.synchronizedAt.toISOString()}:${marketAsOf.toISOString()}`,
    5 * 60_000,
    async () => {
      const targetRow = await prisma.listingRecord.findUnique({
        where: { id: listingId },
        select: {
          ...marketCandidateSelect,
          monthlyCostAmount: true,
          title: true,
          description: true,
        },
      });
      if (!targetRow) throw new Error("LISTING_NOT_FOUND");
      const currentYear = new Date().getFullYear();
      const plausibleWhere = {
        status: "active",
        isVehicleRepresentative: true,
        priceAmount: { gte: 3_000, lte: 3_000_000 },
        mileageKm: { gte: 0, lte: 1_000_000 },
      } satisfies Prisma.ListingRecordWhereInput;
      const targetModelYear = targetRow.vehicle.modelYear;
      const sameModelRows = await prisma.listingRecord.findMany({
        where: {
          ...plausibleWhere,
          vehicle: { is: {
            make: targetRow.vehicle.make,
            model: targetRow.vehicle.model,
            modelYear: { gte: targetModelYear - MARKET_YEAR_SPAN, lte: targetModelYear + MARKET_YEAR_SPAN },
          } },
        },
        select: marketCandidateSelect,
        orderBy: [{ synchronizedAt: "desc" }, { id: "asc" }],
        take: MARKET_POOL_CAP + 1,
      });
      const filterPlausible = (rows: typeof sameModelRows) => rows
        .filter((row) => row.priceAmount >= minimumPlausibleAskingPrice(row.vehicle.modelYear, currentYear))
        .slice(0, MARKET_POOL_CAP)
        .map(marketCandidate);
      const target: AnalystMarketTarget = {
        ...marketCandidate(targetRow),
        monthlyCostAmount: targetRow.monthlyCostAmount,
        title: targetRow.title,
        description: targetRow.description,
      };
      const sameModel = filterPlausible(sameModelRows);
      let cohort = constructIndependentCohort(target, sameModel);
      let fallbackCapped = false;
      if (cohort.tier === "insufficient") {
        const fallbackRows = await prisma.listingRecord.findMany({
          where: {
            ...plausibleWhere,
            priceAmount: { gte: Math.max(3_000, Math.floor(target.priceAmount * 0.6)), lte: Math.min(3_000_000, Math.ceil(target.priceAmount * 1.4)) },
            vehicle: { is: { make: target.make, modelYear: { gte: target.modelYear - 5, lte: target.modelYear + 5 } } },
          },
          select: marketCandidateSelect,
          orderBy: [{ synchronizedAt: "desc" }, { id: "asc" }],
          take: MARKET_POOL_CAP + 1,
        });
        fallbackCapped = fallbackRows.length > MARKET_POOL_CAP;
        cohort = constructIndependentCohort(target, sameModel, filterPlausible(fallbackRows));
      }
      const capped = sameModelRows.length > MARKET_POOL_CAP || fallbackCapped;
      const valuation = valueVehicle(
        { ageYears: currentYear - target.modelYear, mileageKm: target.mileageKm },
        valuationComparables(cohort.candidates, currentYear),
      );
      const priceAssessment = assessAskingPrice({
        askingPrice: target.priceAmount,
        modelYear: target.modelYear,
        currentYear,
        marketValue: valuation.marketValue,
        monthlyCost: target.monthlyCostAmount,
        text: `${target.title ?? ""} ${target.description ?? ""}`,
        comparableCount: valuation.comparableCount,
      });
      const closest = closestValuationCandidates(target, cohort.candidates);
      const prices = closest.map((candidate) => candidate.priceAmount);
      const usableMarketValue = priceAssessment.usable ? valuation.marketValue : null;
      const warnings = [
        ...cohort.warnings,
        ...(capped ? [`The eligible pool exceeded the ${MARKET_POOL_CAP.toLocaleString("en-US")}-row safety cap; the newest ${MARKET_POOL_CAP.toLocaleString("en-US")} were evaluated.`] : []),
        ...(!priceAssessment.usable ? [`The target asking price was quarantined as ${priceAssessment.reason}; no fair-price conclusion is defensible.`] : []),
        ...(priceAssessment.cautious ? ["The asking price is unusually low and should be independently verified."] : []),
      ];
      const evidence: AnalystEvidence[] = [{
        id: "independent-cohort",
        kind: "cohort",
        label: `Independent ${target.make} ${target.model} market cohort`,
        asOf: marketAsOf.toISOString(),
        sampleSize: valuation.comparableCount,
        warning: warnings.join(" ") || undefined,
        href: `/vehicle/${listingId}`,
      }];
      closest.slice(0, 10).forEach((candidate, index) => evidence.push({
        id: `comparable-${index + 1}`,
        kind: "comparable",
        label: `${candidate.modelYear} ${candidate.make} ${candidate.model} · ${candidate.mileageKm} km · ${candidate.priceAmount} SEK`,
        asOf: candidate.synchronizedAt.toISOString(),
        href: `/vehicle/${candidate.id}`,
      }));
      return {
        tool: "analyse_listing_market",
        data: {
          target: { listingId, priceAmount: target.priceAmount, modelYear: target.modelYear, mileageKm: target.mileageKm },
          cohort: {
            tier: cohort.tier,
            definition: cohort.definition,
            eligibleCount: cohort.candidates.length,
            valuationSampleSize: valuation.comparableCount,
            medianPriceAmount: percentile(prices, 0.5),
            firstQuartilePriceAmount: percentile(prices, 0.25),
            thirdQuartilePriceAmount: percentile(prices, 0.75),
          },
          independentValuation: {
            adjustedMarketValueAmount: usableMarketValue,
            rangeMinimumAmount: priceAssessment.usable ? valuation.rangeLow : null,
            rangeMaximumAmount: priceAssessment.usable ? valuation.rangeHigh : null,
            method: valuation.method,
            targetPricePercentile: prices.length
              ? Math.round((prices.filter((price) => price <= target.priceAmount).length / prices.length) * 100)
              : null,
            priceAssessment,
            confidence: usableMarketValue === null || cohort.tier === "make_fallback" || valuation.comparableCount < 8 || valuation.method !== "adjusted"
              ? "low"
              : valuation.comparableCount >= 15 && !priceAssessment.cautious ? "high" : "medium",
          },
          comparables: closest.slice(0, 10).map((candidate) => ({
            listingId: candidate.id,
            name: `${candidate.make} ${candidate.model}`,
            modelYear: candidate.modelYear,
            mileageKm: candidate.mileageKm,
            priceAmount: candidate.priceAmount,
            municipality: candidate.municipality,
            href: `/vehicle/${candidate.id}`,
          })),
          warnings,
        },
        evidence,
      };
    },
  );
}

function postedCutoff(value: SearchFilters["postedWithin"]) {
  if (!value) return undefined;
  const days = value === "today" ? 1 : value === "week" ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000);
}

// bodyStyle and fuelType in SearchFilters only ever hold one value each, so
// they can select a single option but not express "any passenger car" or "petrol
// or hybrid" — these analyst-only extras (outside the shared SearchFilters
// shape) cover what a single-value filter structurally can't.
const commercialBodyStyles: readonly BodyStyle[] = ["van", "pickup"];

export interface AnalystSearchOptions {
  finalistIds?: readonly string[];
  excludeCommercialBodyStyles?: boolean;
  fuelTypes?: readonly FuelType[];
  /** The user's rough budget: rank by closeness to it, not just "under it". */
  targetPrice?: number | null;
  drivetrain?: Drivetrain | "" | null;
  minHorsepower?: number | null;
  maxHorsepower?: number | null;
}

/**
 * Turn whatever budget signal we have into a single figure to rank around, plus
 * a soft band to keep the cheap tail from dominating the pool. "around 200k"
 * (targetPrice) centres on 200k; a bare ceiling centres a bit below it rather
 * than on the cheapest thing that clears it; a floor centres just above it.
 */
export function resolveBudgetFocus(
  minPrice: number | null,
  maxPrice: number | null,
  targetPrice: number | null | undefined,
): { target: number | null; low: number | null; high: number | null } {
  if (targetPrice && targetPrice > 0) {
    return { target: targetPrice, low: Math.round(targetPrice * 0.8), high: Math.round(targetPrice * 1.2) };
  }
  if (minPrice !== null && maxPrice !== null) {
    return { target: Math.round((minPrice + maxPrice) / 2), low: minPrice, high: maxPrice };
  }
  if (maxPrice !== null) {
    return { target: Math.round(maxPrice * 0.88), low: Math.round(maxPrice * 0.5), high: maxPrice };
  }
  if (minPrice !== null) {
    return { target: Math.round(minPrice * 1.25), low: minPrice, high: null };
  }
  return { target: null, low: null, high: null };
}

function searchWhere(filters: SearchFilters, options: AnalystSearchOptions): Prisma.ListingRecordWhereInput {
  const tokens = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const fuelTypes = options.fuelTypes ?? [];
  const { minHorsepower, maxHorsepower } = options;
  const drivetrain = options.drivetrain || "";
  // "VW", "wv" and the like resolve to the canonical make the catalogue stores.
  const brands = [...new Set(filters.brands.map((brand) => resolveBrandAlias(brand) ?? brand))];
  return {
    status: "active",
    isVehicleRepresentative: true,
    ...(filters.sources.length ? { provider: { in: [...filters.sources] } } : {}),
    ...(filters.sellerType ? { sellerType: filters.sellerType } : {}),
    ...(filters.minPrice !== null || filters.maxPrice !== null ? { priceAmount: { ...(filters.minPrice !== null ? { gte: filters.minPrice } : {}), ...(filters.maxPrice !== null ? { lte: filters.maxPrice } : {}) } } : {}),
    ...(filters.minMileageMil !== null || filters.maxMileageMil !== null ? { mileageKm: { ...(filters.minMileageMil !== null ? { gte: filters.minMileageMil * 10 } : {}), ...(filters.maxMileageMil !== null ? { lte: filters.maxMileageMil * 10 } : {}) } } : {}),
    ...(postedCutoff(filters.postedWithin) ? { listedAt: { gte: postedCutoff(filters.postedWithin) } } : {}),
    ...(tokens.length ? { AND: tokens.map((token) => {
      const canonical = resolveBrandAlias(token)?.toLowerCase();
      return canonical && canonical !== token
        ? { OR: [{ searchText: { contains: token } }, { searchText: { contains: canonical } }] }
        : { searchText: { contains: token } };
    }) } : {}),
    vehicle: { is: {
      ...(brands.length ? { make: { in: brands } } : {}),
      ...(filters.models.length ? { model: { in: [...filters.models] } } : {}),
      ...(filters.fuelType ? { fuelType: filters.fuelType } : fuelTypes.length ? { fuelType: { in: [...fuelTypes] } } : {}),
      ...(filters.transmission ? { transmission: filters.transmission } : {}),
      ...(drivetrain ? { drivetrain } : {}),
      ...(filters.bodyStyle ? { bodyStyle: filters.bodyStyle } : options.excludeCommercialBodyStyles ? { bodyStyle: { notIn: [...commercialBodyStyles] } } : {}),
      ...(filters.minYear !== null || filters.maxYear !== null ? { modelYear: { ...(filters.minYear !== null ? { gte: filters.minYear } : {}), ...(filters.maxYear !== null ? { lte: filters.maxYear } : {}) } } : {}),
      ...(minHorsepower != null || maxHorsepower != null ? { horsepower: { ...(minHorsepower != null ? { gte: minHorsepower } : {}), ...(maxHorsepower != null ? { lte: maxHorsepower } : {}) } } : {}),
    } },
  };
}

async function inLanes<T, R>(items: readonly T[], concurrency: number, run: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

// Swedish cars average roughly 1,500 mil (15,000 km) a year; a listing well
// under that rate for its age scores better than one well over it, which is
// what "low mileage" actually means once age is accounted for.
const NORMAL_KM_PER_YEAR = 15_000;

// One physical vehicle can be advertised on two sources at once. Keep the more
// useful advert: the one Carnalys has already analysed, then the cheaper, then
// a stable id tie-break.
function preferListingOfSameVehicle(
  candidate: CandidateRow,
  incumbent: CandidateRow,
): boolean {
  const scored = (row: CandidateRow) => (row.analysis ? 1 : 0);
  if (scored(candidate) !== scored(incumbent)) return scored(candidate) > scored(incumbent);
  if (candidate.priceAmount !== incumbent.priceAmount) return candidate.priceAmount < incumbent.priceAmount;
  return candidate.id < incumbent.id;
}

export async function searchInventoryEvidence(
  filters: SearchFilters,
  options: AnalystSearchOptions = {},
): Promise<AnalystToolResult> {
  const {
    finalistIds = [], excludeCommercialBodyStyles = false, fuelTypes = [],
    targetPrice = null, drivetrain = "", minHorsepower = null, maxHorsepower = null,
  } = options;
  await initializeDatabase();
  const freshness = await getCatalogFreshness();
  const freshnessKey = freshness?.lastSynchronizedAt?.toISOString() ?? "unknown";
  const cacheKey = `search:${freshnessKey}:${JSON.stringify(filters)}:${finalistIds.join(",")}:${excludeCommercialBodyStyles ? 1 : 0}:${[...fuelTypes].sort().join(",")}:${targetPrice ?? ""}:${drivetrain || ""}:${minHorsepower ?? ""}:${maxHorsepower ?? ""}`;
  return analystEvidenceCache.get(cacheKey, 3 * 60_000, async () => {
    const where = searchWhere(filters, { excludeCommercialBodyStyles, fuelTypes, drivetrain, minHorsepower, maxHorsepower });
    const budget = resolveBudgetFocus(filters.minPrice, filters.maxPrice, targetPrice);
    // No extra band pass when the user already gave a hard min AND max — the
    // `where` clause is that band.
    const hardBand = filters.minPrice !== null && filters.maxPrice !== null;
    const bandWhere = !hardBand && budget.target !== null && (budget.low !== null || budget.high !== null)
      ? {
          ...where,
          priceAmount: {
            ...(budget.low !== null ? { gte: budget.low } : {}),
            ...(budget.high !== null ? { lte: budget.high } : {}),
          },
        } satisfies Prisma.ListingRecordWhereInput
      : null;
    const views: Prisma.ListingRecordOrderByWithRelationInput[][] = [
      [{ analysis: { dealScore: { sort: "desc", nulls: "last" } } }, { id: "asc" }],
      [{ priceAmount: "asc" }, { id: "asc" }],
      [{ mileageKm: "asc" }, { id: "asc" }],
      [{ vehicle: { modelYear: "desc" } }, { id: "asc" }],
    ];
    const [total, bandTotal, batches] = await Promise.all([
      prisma.listingRecord.count({ where }),
      bandWhere ? prisma.listingRecord.count({ where: bandWhere }) : Promise.resolve<number | null>(null),
      // The views are independent reads; run them all at once rather than two
      // at a time so search latency is one round-trip, not three. When a budget
      // focus is known, pull the price-ascending view from inside the band so a
      // "~200k" question doesn't hand the ranker 75 rows of 10k bangers.
      inLanes(views, views.length, (orderBy, index) =>
        prisma.listingRecord.findMany({
          where: index === 1 && bandWhere ? bandWhere : where,
          select: candidateSelect,
          orderBy,
          take: 75,
        })),
    ]);
    const currentYear = new Date().getFullYear();
    // De-duplicate: first by listing id across the views, then to one advert
    // per physical vehicle.
    const byId = [...new Map(batches.flat().map((row) => [row.id, row])).values()];
    const byVehicle = new Map<string, CandidateRow>();
    for (const row of byId) {
      const incumbent = byVehicle.get(row.vehicleId);
      if (!incumbent || preferListingOfSameVehicle(row, incumbent)) byVehicle.set(row.vehicleId, row);
    }
    // Roughly 5% of the catalogue advertises a leasing monthly rate or a
    // "call for price" placeholder in priceAmount, not the car's price. Drop
    // anything below the age-relative plausibility floor so those do not top
    // the ranking as impossibly cheap. Mirrors analyse_listing_market.
    const plausible = [...byVehicle.values()]
      .filter((row) => row.priceAmount >= minimumPlausibleAskingPrice(row.vehicle.modelYear, currentYear));
    // Prefer the in-band rows for ranking, but fall back to the whole set if
    // the band is too thin to choose from.
    const inBudgetBand = (price: number) =>
      (budget.low === null || price >= budget.low) && (budget.high === null || price <= budget.high);
    const banded = budget.target !== null ? plausible.filter((row) => inBudgetBand(row.priceAmount)) : plausible;
    const rows = (banded.length >= 8 ? banded : plausible).slice(0, 300);
    const mapped = rows.map(compactListing);
    const years = mapped.map((row) => row.modelYear);
    const usageRates = mapped.map((row) => row.mileageKm / Math.max(1, currentYear - row.modelYear) / NORMAL_KM_PER_YEAR);
    const costs = mapped.map((row) => row.ownership.annualCostAmount);
    const scale = (value: number, values: readonly number[], invert = false) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const normalized = max === min ? 0.5 : (value - min) / (max - min);
      return invert ? 1 - normalized : normalized;
    };
    const ranked = mapped.map((listing, index) => {
      const marketValue = listing.storedAnalysis.marketValueAmount;
      const marketRatio = marketValue ? listing.priceAmount / marketValue : null;
      // Credit for being up to 25% under market value; nothing extra beyond
      // that, and weighted down when the valuation itself is shaky.
      const valuationConfidence = marketValue == null ? 0
        : listing.storedAnalysis.dataConfidence === "high" ? 1
          : listing.storedAnalysis.dataConfidence === "medium" ? 0.7 : 0.4;
      const dealDiscount = marketRatio === null ? 0 : Math.max(0, Math.min(1, (1 - marketRatio) / 0.25));
      // More than ~40% under market usually means bad data or a bad car — ramp
      // a penalty in rather than rewarding it.
      const tooCheap = marketRatio !== null && marketRatio < 0.6 ? Math.min(1, (0.6 - marketRatio) / 0.35) : 0;
      const budgetFit = budget.target
        ? Math.max(0, 1 - Math.abs(listing.priceAmount - budget.target) / budget.target)
        : 0.5;
      const confidenceScore = listing.storedAnalysis.dataConfidence === "high" ? 1 : listing.storedAnalysis.dataConfidence === "medium" ? 0.65 : 0.3;
      const freshnessScore = Math.max(0, 1 - (Date.now() - new Date(listing.freshness.lastSeenAt).valueOf()) / (30 * 86_400_000));
      const score = dealDiscount * valuationConfidence * 0.16
        + budgetFit * 0.20
        + scale(usageRates[index], usageRates, true) * 0.15
        + scale(listing.modelYear, years) * 0.12
        + scale(listing.ownership.annualCostAmount, costs, true) * 0.10
        + confidenceScore * 0.10
        + freshnessScore * 0.07
        + ((listing.storedAnalysis.dealScore ?? 50) / 100) * 0.10
        - tooCheap * 0.18;
      return {
        ...listing,
        deterministicRankScore: Math.round(score * 100),
        marketPriceRatio: marketRatio === null ? null : Number(marketRatio.toFixed(3)),
        priceLooksTooLow: tooCheap > 0.25,
      };
    }).toSorted((a, b) => b.deterministicRankScore - a.deterministicRankScore || a.listingId.localeCompare(b.listingId));
    const finalists = await inLanes(finalistIds.slice(0, 5), 2, (id) => getListingAnalysisEvidence(id, false));
    const asOf = freshness?.lastSynchronizedAt?.toISOString() ?? new Date().toISOString();
    const budgetFocus = budget.target === null
      ? null
      : { targetAmount: budget.target, bandLowAmount: budget.low, bandHighAmount: budget.high, matchesInBand: bandTotal };
    return {
      tool: "search_inventory",
      data: {
        filters,
        totalMatches: total,
        budgetFocus,
        rankedPoolSize: rows.length,
        candidates: ranked.slice(0, 20),
        finalists: finalists.map((result) => result.data),
        warnings: [
          ...(total > rows.length ? [`The database matched ${total} listings; deterministic multi-view ranking evaluated up to 300 and returned 20.`] : []),
          ...(budgetFocus ? [`Ranking was centred on ${budget.target!.toLocaleString("en-US")} SEK (band ${budget.low?.toLocaleString("en-US") ?? "0"}–${budget.high?.toLocaleString("en-US") ?? "∞"} SEK); ${bandTotal ?? 0} listings fall inside it and were preferred over cheaper matches. totalMatches counts every match, not the sensible budget range.`] : []),
          ...(excludeCommercialBodyStyles ? ["Vans and pickups were excluded as commercial body styles."] : []),
          ...(fuelTypes.length ? [`Restricted to fuel types: ${fuelTypes.join(", ")}.`] : []),
          ...(drivetrain ? [`Restricted to ${drivetrain.replace(/_/g, " ")}.`] : []),
          ...(minHorsepower != null || maxHorsepower != null ? [`Restricted to horsepower ${minHorsepower ?? "any"}–${maxHorsepower ?? "any"}.`] : []),
          "Any candidate flagged priceLooksTooLow is likely mispriced data or a problem car — verify before recommending it as a deal.",
          "Market price ratios use stored Carnalys valuations for ranking only; request analyse_listing_market for an independent cohort check.",
        ],
      },
      evidence: [
        {
          id: "inventory-search",
          kind: "search",
          label: "Carnalys inventory search",
          asOf,
          sampleSize: total,
          warning: total > rows.length ? "Ranked from a capped 300-row multi-view pool of the matching inventory." : undefined,
          href: "/#cars",
        },
        // Ten, not just a handful: a "top 10" answer needs one evidence id —
        // and one visual card — per car it names.
        ...ranked.slice(0, 10).map((listing) => ({
          id: `candidate-${listing.listingId}`,
          kind: "listing" as const,
          label: `${listing.modelYear} ${listing.name}${listing.variant ? ` ${listing.variant}` : ""} · ${listing.mileageKm.toLocaleString("sv-SE")} km · ${listing.priceAmount.toLocaleString("sv-SE")} kr`,
          asOf,
          href: listing.href,
          listing: {
            listingId: listing.listingId,
            name: listing.name,
            variant: listing.variant,
            modelYear: listing.modelYear,
            priceAmount: listing.priceAmount,
            mileageKm: listing.mileageKm,
            fuelType: listing.fuelType,
            transmission: listing.transmission,
            sellerType: listing.sellerType,
            dealScore: listing.storedAnalysis.dealScore,
            monthlyCostAmount: listing.ownership.monthlyCostAmount,
            marketValueAmount: listing.storedAnalysis.marketValueAmount,
            imageUrl: listing.imageUrl,
          },
        })),
      ],
    };
  });
}

export async function compareListingsEvidence(listingIds: readonly string[]): Promise<AnalystToolResult> {
  const ordered = [...listingIds].slice(0, 3);
  // Two or three cars, each an independent read pair — fan them all out.
  const pairs = orderByRequestedIds(ordered, await inLanes(ordered, ordered.length, async (listingId) => {
    const [listing, market] = await Promise.all([
      getListingAnalysisEvidence(listingId, false),
      analyseListingMarketEvidence(listingId),
    ]);
    return { listingId, listing, market };
  }), (pair) => pair.listingId);
  return {
    tool: "compare_listings",
    data: {
      order: ordered,
      cars: pairs.map(({ listing, market }) => ({
        listing: listing.data,
        independentMarket: market.data,
      })),
      instruction: "This deterministic matrix does not choose a winner; interpret it using the user's stated priorities.",
    },
    evidence: pairs.flatMap(({ listing, market }) => [...listing.evidence, ...market.evidence]),
  };
}
