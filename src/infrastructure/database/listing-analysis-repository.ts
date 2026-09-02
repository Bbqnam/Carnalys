import { Prisma } from "@/generated/prisma/client";
import { plausibleAskingPriceSql } from "@/domain/vehicle/pricing";
import { buildOwnershipCostItems } from "@/domain/vehicle/analysis/ownership-cost-items";
import {
  buildBuyConfidenceFactors,
  buildDealScoreFactors,
} from "@/domain/vehicle/analysis/score-factors";
import {
  computeBuyConfidence,
  computeDealScore,
  conditionScores,
  priceValueScore,
} from "@/domain/vehicle/analysis/deal-score";
import {
  valueVehicle,
  type ValuationComparable,
} from "@/domain/vehicle/analysis/comparable-valuation";
import { assessAskingPrice } from "@/domain/vehicle/analysis/price-plausibility";
import type { ServiceHistoryStatus } from "@/domain/vehicle";
import { initializeDatabase, prisma } from "./prisma";

interface AnalysisTarget {
  id: string;
  vehicleId: string;
  priceAmount: number;
  mileageKm: number;
  ownerCount: number | null;
  serviceHistory: string | null;
  monthlyCostAmount: number | null;
  title: string | null;
  description: string | null;
  synchronizedAt: Date;
  vehicle: {
    make: string;
    model: string;
    fuelType: string;
    transmission: string;
    bodyStyle: string;
    performanceVariant: string | null;
    modelYear: number;
  };
}

interface MarketComparableRow {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  bodyStyle: string;
  performanceVariant: string | null;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
}

interface SegmentComparableRow {
  id: string;
  vehicleId: string;
  make: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
}

// 11.0: canonical taxonomy — cohorts key on the canonical model *family* and
// gate on bodyStyle (when known) + fuelType (now also in the wide tier) +
// performanceVariant (when the target has one), with a new same-fuel family
// tier before the same-make segment fallback. Bumping this re-analyses every
// stored listing on the next sweep.
const methodologyVersion = "canonical-taxonomy-cohorts-11.0";

const SERVICE_HISTORY_VALUES: ReadonlySet<ServiceHistoryStatus> = new Set([
  "complete",
  "partial",
  "missing",
  "unknown",
]);

function normalizeServiceHistory(value: string | null): ServiceHistoryStatus {
  return value && SERVICE_HISTORY_VALUES.has(value as ServiceHistoryStatus)
    ? (value as ServiceHistoryStatus)
    : "unknown";
}

function roundedThousands(value: number) {
  return Math.max(1_000, Math.round(value / 1_000) * 1_000);
}

const comparableDisplaySampleSize = 40;

// Even, order-preserving down-sample of the sorted comparable prices — keeps the
// true shape of the distribution (including its tails) rather than just the
// cheapest N, without serialising a thousand rows for a popular cohort.
function evenlySampled(sortedValues: readonly number[], sampleSize: number) {
  if (sortedValues.length <= sampleSize) return [...sortedValues];
  const step = (sortedValues.length - 1) / (sampleSize - 1);
  return Array.from(
    { length: sampleSize },
    (_, index) => sortedValues[Math.round(index * step)],
  );
}

function modelKey({ make, model }: { make: string; model: string }) {
  return JSON.stringify([make, model]);
}

function segmentKey({ make }: { make: string }) {
  return make;
}

async function loadTargets(
  listingIds: readonly string[] | undefined,
  limit: number,
): Promise<AnalysisTarget[]> {
  return prisma.listingRecord.findMany({
    where: {
      status: "active",
      ...(listingIds
        ? { id: { in: [...listingIds] } }
        : {
            OR: [
              { analysis: { is: null } },
              { analysis: { is: { methodologyVersion: { not: methodologyVersion } } } },
            ],
          }),
    },
    select: {
      id: true,
      vehicleId: true,
      priceAmount: true,
      mileageKm: true,
      ownerCount: true,
      serviceHistory: true,
      monthlyCostAmount: true,
      title: true,
      description: true,
      synchronizedAt: true,
      vehicle: {
        select: {
          make: true,
          model: true,
          fuelType: true,
          transmission: true,
          bodyStyle: true,
          performanceVariant: true,
          modelYear: true,
        },
      },
    },
    orderBy: { synchronizedAt: "desc" },
    take: limit,
  });
}

export async function refreshStoredListingAnalyses(
  listingIds?: readonly string[],
  limit = 250,
) {
  await initializeDatabase();
  const targets = await loadTargets(listingIds, limit);
  if (targets.length === 0) return 0;

  // One year for the whole batch, so every plausibility check and age
  // calculation agrees even if the run straddles midnight on New Year.
  const analysisYear = new Date().getFullYear();

  const cohorts = [
    ...new Map(
      targets.map(({ vehicle }) => [modelKey(vehicle), vehicle] as const),
    ).values(),
  ];
  const comparables = await prisma.$queryRaw<MarketComparableRow[]>(Prisma.sql`
    WITH "target_cohorts" ("make", "model") AS (
      VALUES ${Prisma.join(
        cohorts.map(
          (vehicle) => Prisma.sql`(${vehicle.make}, ${vehicle.model})`,
        ),
      )}
    )
    SELECT DISTINCT ON (listing."vehicleId")
      listing."id" AS "id",
      listing."vehicleId" AS "vehicleId",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      vehicle."fuelType" AS "fuelType",
      vehicle."transmission" AS "transmission",
      vehicle."bodyStyle" AS "bodyStyle",
      vehicle."performanceVariant" AS "performanceVariant",
      vehicle."modelYear" AS "modelYear",
      listing."mileageKm" AS "mileageKm",
      listing."priceAmount" AS "priceAmount"
    FROM "target_cohorts" AS cohort
    INNER JOIN "VehicleRecord" AS vehicle
      ON vehicle."make" = cohort."make"
      AND vehicle."model" = cohort."model"
    INNER JOIN "ListingRecord" AS listing
      ON listing."vehicleId" = vehicle."id"
      AND listing."status" = 'active'
    WHERE ${Prisma.raw(
      plausibleAskingPriceSql(
        'listing."priceAmount"',
        'vehicle."modelYear"',
        analysisYear,
      ),
    )}
    -- One representative ad per physical vehicle: newest synchronized, id tie-break.
    ORDER BY listing."vehicleId", listing."synchronizedAt" DESC, listing."id" ASC
  `);
  const comparablesByModel = new Map<string, MarketComparableRow[]>();
  for (const comparable of comparables) {
    const key = modelKey(comparable);
    const rows = comparablesByModel.get(key) ?? [];
    rows.push(comparable);
    comparablesByModel.set(key, rows);
  }

  const toComparable = (
    row: { modelYear: number; mileageKm: number | bigint; priceAmount: number | bigint },
  ): ValuationComparable => ({
    priceAmount: Number(row.priceAmount),
    ageYears: analysisYear - row.modelYear,
    mileageKm: Number(row.mileageKm),
  });

  // Body style is only a gate when both sides actually know it — 66% of Blocket
  // vehicles carry `bodyStyle = 'other'`, and excluding them would starve most
  // cohorts. A performance variant (GTI, GT3, T8…) is only a gate when the
  // *target* has one, so a base car is never excluded for lacking it.
  const bodyMatches = (a: string, b: string) =>
    a === "other" || b === "other" || a === b;
  const performanceMatches = (target: string | null, comparable: string | null) =>
    !target || comparable === target;

  /** Exact cohort: same model family, body (when known), gearbox, fuel and
   *  performance variant (when the target has one), within 3 model years and
   *  120,000 km. */
  function tier1Comparables(target: AnalysisTarget): ValuationComparable[] {
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          comparable.fuelType === target.vehicle.fuelType &&
          comparable.transmission === target.vehicle.transmission &&
          bodyMatches(comparable.bodyStyle, target.vehicle.bodyStyle) &&
          performanceMatches(target.vehicle.performanceVariant, comparable.performanceVariant) &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 3 &&
          Math.abs(Number(comparable.mileageKm) - target.mileageKm) <= 120_000,
      )
      .map(toComparable);
  }

  /** Same model family and fuel, wider year band, gearbox ignored — a rare car
   *  still valued against its own powertrain, never against a different one. */
  function tier1WideComparables(target: AnalysisTarget): ValuationComparable[] {
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          comparable.fuelType === target.vehicle.fuelType &&
          bodyMatches(comparable.bodyStyle, target.vehicle.bodyStyle) &&
          performanceMatches(target.vehicle.performanceVariant, comparable.performanceVariant) &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 8,
      )
      .map(toComparable);
  }

  /** Same model family and fuel only — body, gearbox and performance ignored.
   *  Catches family-PHEV cars (e.g. a Ceed SW plug-in hybrid) that used to
   *  starve every tighter tier and fall straight to the whole-make segment. */
  function tier1FuelComparables(target: AnalysisTarget): ValuationComparable[] {
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          comparable.fuelType === target.vehicle.fuelType &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 8,
      )
      .map(toComparable);
  }

  // Only vehicles with no usable same-family pool fall through to same-make.
  const needsSegmentFallback = targets.filter(
    (target) =>
      tier1Comparables(target).length < 3 &&
      tier1WideComparables(target).length < 3 &&
      tier1FuelComparables(target).length < 3,
  );
  const segmentMakes = [
    ...new Set(needsSegmentFallback.map(({ vehicle }) => vehicle.make)),
  ];
  const segmentComparables = segmentMakes.length
    ? await prisma.$queryRaw<SegmentComparableRow[]>(Prisma.sql`
        SELECT DISTINCT ON (listing."vehicleId")
          listing."id" AS "id",
          listing."vehicleId" AS "vehicleId",
          vehicle."make" AS "make",
          vehicle."modelYear" AS "modelYear",
          listing."mileageKm" AS "mileageKm",
          listing."priceAmount" AS "priceAmount"
        FROM "VehicleRecord" AS vehicle
        INNER JOIN "ListingRecord" AS listing
          ON listing."vehicleId" = vehicle."id"
          AND listing."status" = 'active'
        WHERE vehicle."make" IN (${Prisma.join(segmentMakes)})
          AND ${Prisma.raw(
            plausibleAskingPriceSql(
              'listing."priceAmount"',
              'vehicle."modelYear"',
              analysisYear,
            ),
          )}
        ORDER BY listing."vehicleId", listing."synchronizedAt" DESC, listing."id" ASC
      `)
    : [];
  const comparablesBySegment = new Map<string, SegmentComparableRow[]>();
  for (const comparable of segmentComparables) {
    const key = segmentKey(comparable);
    const rows = comparablesBySegment.get(key) ?? [];
    rows.push(comparable);
    comparablesBySegment.set(key, rows);
  }

  function tier2Comparables(target: AnalysisTarget): ValuationComparable[] {
    const minimumPrice = target.priceAmount * 0.6;
    const maximumPrice = target.priceAmount * 1.4;
    return (comparablesBySegment.get(segmentKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 5 &&
          Number(comparable.priceAmount) >= minimumPrice &&
          Number(comparable.priceAmount) <= maximumPrice,
      )
      .map(toComparable);
  }

  const calculatedAt = new Date();
  await prisma.$transaction(
    targets.map((target) => {
      const tier1 = tier1Comparables(target);
      const usedFallbackTier = tier1.length < 3;
      const cohort =
        tier1.length >= 3
          ? tier1
          : (() => {
              const wide = tier1WideComparables(target);
              if (wide.length >= 3) return wide;
              const sameFuel = tier1FuelComparables(target);
              if (sameFuel.length >= 3) return sameFuel;
              const segment = tier2Comparables(target);
              return segment.length >= 3 ? segment : [];
            })();

      const valuation = valueVehicle(
        {
          ageYears: analysisYear - target.vehicle.modelYear,
          mileageKm: target.mileageKm,
        },
        cohort,
      );

      const assessment = assessAskingPrice({
        askingPrice: target.priceAmount,
        modelYear: target.vehicle.modelYear,
        currentYear: analysisYear,
        marketValue: valuation.marketValue,
        monthlyCost: target.monthlyCostAmount,
        text: `${target.title ?? ""} ${target.description ?? ""}`,
        comparableCount: valuation.comparableCount,
      });

      const canComparePrice =
        valuation.marketValue !== null && assessment.usable;
      const priceDelta = canComparePrice
        ? (valuation.marketValue! - target.priceAmount) / valuation.marketValue!
        : 0;

      const dealResult = computeDealScore({
        priceDelta,
        canComparePrice,
        comparableCount: valuation.comparableCount,
      });

      const condition = conditionScores({
        ageYears: analysisYear - target.vehicle.modelYear,
        mileageKm: target.mileageKm,
        ownerCount: target.ownerCount,
        serviceHistory: normalizeServiceHistory(target.serviceHistory),
      });
      const buyConfidenceScore = computeBuyConfidence({ ...condition });

      // Data Confidence: how much the *valuation* can be trusted. Independent of
      // whether the price was rated (that is carried by dealScore === null).
      const confidence: "low" | "medium" | "high" =
        valuation.marketValue === null
          ? "low"
          : assessment.cautious ||
              usedFallbackTier ||
              valuation.method === "raw_median"
            ? "low"
            : valuation.comparableCount >= 15
              ? "high"
              : valuation.comparableCount >= 8
                ? "medium"
                : "low";

      const factorInputs = {
        hasMarketEstimate: canComparePrice,
        priceDelta: canComparePrice ? priceDelta : 0,
        priceValueScore: priceValueScore(priceDelta),
        priceReasonCode: assessment.reasonCode,
        ageScore: condition.ageScore,
        mileageScore: condition.mileageScore,
        serviceHistoryScore: condition.serviceHistoryScore,
        ownerScore: condition.ownerScore,
        hasServiceHistory: condition.hasServiceHistory,
        ownerCount: target.ownerCount ?? undefined,
        age: Math.max(0, analysisYear - target.vehicle.modelYear),
        modelYear: target.vehicle.modelYear,
        mileageKm: target.mileageKm,
      };

      const fuelMultiplier =
        target.vehicle.fuelType === "electric" ? 0.8 : 1;
      const annualOwnershipCost = Math.round(
        (34_000 + target.priceAmount * 0.065) * fuelMultiplier,
      );

      const sampledPrices = evenlySampled(
        cohort.map((c) => c.priceAmount).toSorted((a, b) => a - b),
        comparableDisplaySampleSize,
      );

      const values = {
        marketValueAmount: valuation.marketValue ?? target.priceAmount,
        marketValueMinimum:
          valuation.rangeLow ?? roundedThousands(target.priceAmount * 0.9),
        marketValueMaximum:
          valuation.rangeHigh ?? roundedThousands(target.priceAmount * 1.1),
        comparableCount: valuation.comparableCount,
        comparablePrices: sampledPrices,
        confidence,
        dealScore: dealResult.value,
        dealScoreFactors: buildDealScoreFactors(
          factorInputs,
        ) as unknown as Prisma.InputJsonValue,
        buyConfidenceScore,
        buyConfidenceFactors: buildBuyConfidenceFactors(
          factorInputs,
        ) as unknown as Prisma.InputJsonValue,
        annualOwnershipCost,
        ownershipCostItems: buildOwnershipCostItems({
          totalAnnualCost: annualOwnershipCost,
          askingPrice: target.priceAmount,
          age: Math.max(0, analysisYear - target.vehicle.modelYear),
        }) as unknown as Prisma.InputJsonValue,
        methodologyVersion,
        calculatedAt,
        sourceSynchronizedAt: target.synchronizedAt,
      };

      return prisma.listingAnalysisRecord.upsert({
        where: { listingId: target.id },
        create: { listingId: target.id, ...values },
        update: values,
      });
    }),
    { timeout: 60_000 },
  );

  return targets.length;
}
