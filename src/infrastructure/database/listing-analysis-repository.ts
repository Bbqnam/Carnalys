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
  v11VehicleScores,
} from "@/domain/vehicle/analysis/deal-score";
import { assessEquipment } from "@/domain/vehicle/analysis/equipment-score";
import {
  assessDefects,
  assessMileage,
  classifyVehicleKind,
  defectModifier,
  sellerProtectionScore,
  serviceHistoryModifier,
  transparencyScore,
  type MileageStatus,
  type VehicleKind,
} from "@/domain/vehicle/analysis/listing-assessment";
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
  sellerType: string;
  synchronizedAt: Date;
  equipment: { label: string }[];
  vehicle: {
    registrationNumber: string | null;
    vin: string | null;
    make: string;
    model: string;
    variant: string | null;
    generation: string | null;
    fuelType: string;
    transmission: string;
    bodyStyle: string;
    performanceVariant: string | null;
    modelYear: number;
  };
}

interface MarketComparableRow {
  id: string;
  provider: string;
  vehicleId: string;
  make: string;
  model: string;
  title: string | null;
  variant: string | null;
  generation: string | null;
  fuelType: string;
  transmission: string;
  bodyStyle: string;
  performanceVariant: string | null;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
}

type SegmentComparableRow = MarketComparableRow;

// 11.0: canonical taxonomy — cohorts key on the canonical model *family* and
// gate on bodyStyle (when known) + fuelType (now also in the wide tier) +
// performanceVariant (when the target has one), with a new same-fuel family
// tier before the same-make segment fallback. Bumping this re-analyses every
// stored listing on the next sweep.
const methodologyVersion = "canonical-taxonomy-cohorts-11.0";
const scoringVersion = "deal-score-11.0";

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
              {
                analysis: {
                  is: {
                    OR: [
                      { methodologyVersion: { not: methodologyVersion } },
                      { scoringVersion: { not: scoringVersion } },
                    ],
                  },
                },
              },
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
      sellerType: true,
      synchronizedAt: true,
      equipment: { select: { label: true } },
      vehicle: {
        select: {
          registrationNumber: true,
          vin: true,
          make: true,
          model: true,
          variant: true,
          generation: true,
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
      listing."provider" AS "provider",
      listing."vehicleId" AS "vehicleId",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      listing."title" AS "title",
      vehicle."variant" AS "variant",
      vehicle."generation" AS "generation",
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
  const kindOf = (row: {
    title?: string | null;
    model?: string | null;
    variant?: string | null;
    bodyStyle?: string | null;
  }) => classifyVehicleKind(row);
  const compatibleKind = (target: VehicleKind, comparable: VehicleKind) =>
    target === comparable ||
    (target === "passenger_car" && comparable === "unknown") ||
    (target === "unknown" && comparable === "passenger_car");

  /** Exact cohort: same model family, body (when known), gearbox, fuel and
   *  performance variant (when the target has one), within 3 model years and
   *  120,000 km. */
  function tier1Comparables(target: AnalysisTarget): MarketComparableRow[] {
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          compatibleKind(targetKind, kindOf(comparable)) &&
          comparable.fuelType === target.vehicle.fuelType &&
          comparable.transmission === target.vehicle.transmission &&
          bodyMatches(comparable.bodyStyle, target.vehicle.bodyStyle) &&
          performanceMatches(target.vehicle.performanceVariant, comparable.performanceVariant) &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 3 &&
          Math.abs(Number(comparable.mileageKm) - target.mileageKm) <= 120_000,
      );
  }

  /** Same model family and fuel, wider year band, gearbox ignored — a rare car
   *  still valued against its own powertrain, never against a different one. */
  function tier1WideComparables(target: AnalysisTarget): MarketComparableRow[] {
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          compatibleKind(targetKind, kindOf(comparable)) &&
          comparable.fuelType === target.vehicle.fuelType &&
          bodyMatches(comparable.bodyStyle, target.vehicle.bodyStyle) &&
          performanceMatches(target.vehicle.performanceVariant, comparable.performanceVariant) &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 8,
      );
  }

  /** Same model family and fuel only — body, gearbox and performance ignored.
   *  Catches family-PHEV cars (e.g. a Ceed SW plug-in hybrid) that used to
   *  starve every tighter tier and fall straight to the whole-make segment. */
  function tier1FuelComparables(target: AnalysisTarget): MarketComparableRow[] {
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          compatibleKind(targetKind, kindOf(comparable)) &&
          comparable.fuelType === target.vehicle.fuelType &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 8,
      );
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
          listing."provider" AS "provider",
          listing."vehicleId" AS "vehicleId",
          vehicle."make" AS "make",
          vehicle."model" AS "model",
          listing."title" AS "title",
          vehicle."variant" AS "variant",
          vehicle."generation" AS "generation",
          vehicle."fuelType" AS "fuelType",
          vehicle."transmission" AS "transmission",
          vehicle."bodyStyle" AS "bodyStyle",
          vehicle."performanceVariant" AS "performanceVariant",
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

  function tier2Comparables(target: AnalysisTarget): SegmentComparableRow[] {
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    const minimumPrice = target.priceAmount * 0.6;
    const maximumPrice = target.priceAmount * 1.4;
    return (comparablesBySegment.get(segmentKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          compatibleKind(targetKind, kindOf(comparable)) &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 5 &&
          Number(comparable.priceAmount) >= minimumPrice &&
          Number(comparable.priceAmount) <= maximumPrice,
      );
  }

  type CohortTier = "exact" | "wide" | "same_fuel" | "segment" | "none";
  const contexts = targets.map((target) => {
    const exact = tier1Comparables(target);
    let tier: CohortTier = "exact";
    let cohort = exact;
    if (cohort.length < 3) {
      const wide = tier1WideComparables(target);
      const sameFuel = tier1FuelComparables(target);
      const segment = tier2Comparables(target);
      if (wide.length >= 3) {
        tier = "wide";
        cohort = wide;
      } else if (sameFuel.length >= 3) {
        tier = "same_fuel";
        cohort = sameFuel;
      } else if (segment.length >= 3) {
        tier = "segment";
        cohort = segment;
      } else {
        tier = "none";
        cohort = [];
      }
    }
    const ageYears = Math.max(0, analysisYear - target.vehicle.modelYear);
    const valuation = valueVehicle(
      { ageYears, mileageKm: target.mileageKm },
      cohort.map(toComparable),
    );
    const equipmentCohort = [...cohort]
      .sort(
        (a, b) =>
          Math.abs(a.modelYear - target.vehicle.modelYear) * 60_000 +
          Math.abs(Number(a.mileageKm) - target.mileageKm) -
          (Math.abs(b.modelYear - target.vehicle.modelYear) * 60_000 +
            Math.abs(Number(b.mileageKm) - target.mileageKm)),
      )
      .slice(0, 40);
    return { target, tier, cohort, equipmentCohort, ageYears, valuation };
  });

  const equipmentListingIds = [
    ...new Set(contexts.flatMap(({ equipmentCohort }) => equipmentCohort.map(({ id }) => id))),
  ];
  const equipmentRows = equipmentListingIds.length
    ? await prisma.listingEquipmentRecord.findMany({
        where: { listingId: { in: equipmentListingIds } },
        select: { listingId: true, label: true },
      })
    : [];
  const equipmentByListing = new Map<string, string[]>();
  for (const row of equipmentRows) {
    const labels = equipmentByListing.get(row.listingId) ?? [];
    labels.push(row.label);
    equipmentByListing.set(row.listingId, labels);
  }

  const mileageStatusCode: Record<MileageStatus, number> = {
    verified: 3,
    plausible: 2,
    unknown: 1,
    suspicious: 0,
  };
  const defectCategoryCode = {
    none: 0,
    minor_cosmetic: 1,
    minor_mechanical: 2,
    significant_mechanical: 3,
    major_defect: 4,
    repair_object: 5,
  } as const;

  const calculatedAt = new Date();
  await prisma.$transaction(
    contexts.map(({ target, tier, cohort, equipmentCohort, ageYears, valuation }) => {

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

      const serviceHistory = normalizeServiceHistory(target.serviceHistory);
      const text = `${target.title ?? ""} ${target.description ?? ""}`;
      const mileageStatus = assessMileage(target.mileageKm, ageYears, text);
      const vehicleScores = v11VehicleScores({
        ageYears,
        mileageKm: target.mileageKm,
        mileageKnown: mileageStatus === "verified" || mileageStatus === "plausible",
        ownerCount: target.ownerCount,
      });
      const equipment = assessEquipment(
        target.equipment.map(({ label }) => label),
        equipmentCohort.map(({ id }) => equipmentByListing.get(id) ?? []),
      );
      const defectCategory = assessDefects(target.title, target.description);
      const serviceModifier = serviceHistoryModifier(serviceHistory);
      const knownDefectModifier = defectModifier(defectCategory);
      const listingTransparencyScore = transparencyScore({
        registrationNumber: Boolean(target.vehicle.registrationNumber),
        vin: Boolean(target.vehicle.vin),
        description: target.description,
        serviceHistory,
        ownerCount: target.ownerCount,
        defectCategory,
      });
      const protectionScore = sellerProtectionScore({
        sellerType: target.sellerType,
        title: target.title,
        description: target.description,
      });
      const targetKind = kindOf({ ...target.vehicle, title: target.title });
      const dealResult = computeDealScore({
        priceDelta,
        canComparePrice,
        comparableCount: valuation.comparableCount,
        mileageScore: vehicleScores.mileageScore,
        ageScore: vehicleScores.ageScore,
        ownerScore: vehicleScores.ownerScore,
        equipmentScore: equipment.score,
        transparencyScore: listingTransparencyScore,
        sellerProtectionScore: protectionScore,
        serviceModifier,
        defectModifier: knownDefectModifier,
        eligibleForRanking: mileageStatus !== "suspicious",
      });

      const condition = conditionScores({
        ageYears,
        mileageKm: target.mileageKm,
        ownerCount: target.ownerCount,
        serviceHistory,
      });
      const buyConfidenceScore = computeBuyConfidence({ ...condition });

      const providers = new Set(cohort.map(({ provider }) => provider)).size;
      const generationMatches = target.vehicle.generation
        ? cohort.filter(({ generation }) => generation === target.vehicle.generation).length /
          Math.max(1, cohort.length)
        : 0.5;
      const dispersion =
        valuation.marketValue && valuation.rangeLow && valuation.rangeHigh
          ? (valuation.rangeHigh - valuation.rangeLow) / valuation.marketValue
          : 1;
      const tierPoints: Record<CohortTier, number> = {
        exact: 24,
        wide: 16,
        same_fuel: 10,
        segment: 0,
        none: -20,
      };
      let confidenceScore =
        Math.min(25, valuation.comparableCount * 2) +
        tierPoints[tier] +
        (valuation.method === "adjusted" ? 16 : valuation.method === "raw_median" ? 7 : -20) +
        (generationMatches >= 0.75 ? 8 : generationMatches < 0.25 ? -5 : 2) +
        (providers >= 2 ? 5 : 0) +
        (dispersion <= 0.3 ? 10 : dispersion > 0.65 ? -10 : 2) +
        (equipment.coverage === "known" ? 4 : -4) +
        (mileageStatus === "suspicious" ? -30 : mileageStatus === "unknown" ? -12 : 5) +
        (targetKind === "unknown" ? -8 : 4) +
        (assessment.cautious ? -20 : 0);
      confidenceScore = Math.max(0, Math.min(100, confidenceScore));
      const confidence: "unrated" | "low" | "medium" | "high" =
        !canComparePrice
          ? "unrated"
          : confidenceScore >= 72
            ? "high"
            : confidenceScore >= 52
              ? "medium"
              : "low";
      const confidenceRank =
        dealResult.value === null
          ? 0
          : confidence === "high"
            ? 3
            : confidence === "medium"
              ? 2
              : confidence === "low"
                ? 1
                : 0;

      const factorInputs = {
        hasMarketEstimate: canComparePrice,
        priceDelta: canComparePrice ? priceDelta : 0,
        priceValueScore: dealResult.priceValueScore,
        priceReasonCode: assessment.reasonCode,
        ageScore: vehicleScores.ageScore,
        mileageScore: vehicleScores.mileageScore,
        serviceHistoryScore: condition.serviceHistoryScore,
        ownerScore: vehicleScores.ownerScore,
        equipmentScore: equipment.score,
        transparencyScore: listingTransparencyScore,
        sellerProtectionScore: protectionScore,
        serviceModifier,
        defectModifier: knownDefectModifier,
        mileageStatusCode: mileageStatusCode[mileageStatus],
        equipmentCoverageCode: equipment.coverage === "known" ? 1 : 0,
        defectCategoryCode: defectCategoryCode[defectCategory],
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
        confidenceRank,
        dealScore: dealResult.value,
        dealScoreFactors: buildDealScoreFactors(
          factorInputs,
        ) as unknown as Prisma.InputJsonValue,
        buyConfidenceScore,
        buyConfidenceFactors: buildBuyConfidenceFactors(
          {
            ...factorInputs,
            ageScore: condition.ageScore,
            mileageScore: condition.mileageScore,
            ownerScore: condition.ownerScore,
          },
        ) as unknown as Prisma.InputJsonValue,
        annualOwnershipCost,
        ownershipCostItems: buildOwnershipCostItems({
          totalAnnualCost: annualOwnershipCost,
          askingPrice: target.priceAmount,
          age: Math.max(0, analysisYear - target.vehicle.modelYear),
        }) as unknown as Prisma.InputJsonValue,
        methodologyVersion,
        scoringVersion,
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
