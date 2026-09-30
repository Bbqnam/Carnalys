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
  weightedMedian,
  weightedPercentile,
  MIN_COMPARABLES,
  MIN_FIT_COMPARABLES,
  type ValuationComparable,
} from "@/domain/vehicle/analysis/comparable-valuation";
import { assessAskingPrice } from "@/domain/vehicle/analysis/price-plausibility";
import {
  scoreComparable,
  tierWeight,
  recencyDecayFactor,
  type ComparableTier,
  type SimilarityCandidate,
  type SimilarityTarget,
} from "@/domain/vehicle/analysis/comparable-similarity";
import { computeValuationConfidence } from "@/domain/vehicle/analysis/valuation-confidence";
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
    fuelType: string;
    transmission: string;
    bodyStyle: string;
    drivetrain: string | null;
    generation: string | null;
    facelift: boolean | null;
    trim: string | null;
    performanceVariant: string | null;
    modelYear: number;
    horsepower: number | null;
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
  drivetrain: string | null;
  facelift: boolean | null;
  trim: string | null;
  performanceVariant: string | null;
  modelYear: number;
  horsepower: number | null;
  mileageKm: number;
  priceAmount: number;
  sellerType: string;
  synchronizedAt: Date;
}

type SegmentComparableRow = MarketComparableRow;

// 12.0: similarity-weighted cohorts — the boolean tier1/tier1Wide/tier1Fuel
// cascade is replaced by a continuous similarity score per candidate
// (generation, facelift, drivetrain, trim, performance variant, body, year
// and mileage proximity, seller type, recency — see
// comparable-similarity.ts), bucketed into hierarchical tiers A-D that widen
// only as far as needed for a real fit. `valueVehicle` now takes a `weight`
// per comparable (similarity tier x recency decay) and uses weighted median/
// percentile/least-squares throughout, so a weak or stale comparable can
// never carry the same influence as an exact one. Also adds
// `valuationConfidenceScore/Label` and `comparableInsights`. Bumping this
// re-analyses every stored listing on the next sweep.
const methodologyVersion = "similarity-weighted-cohorts-12.0";
// Deal Score semantics are versioned independently from market valuation —
// v11 adds equipment coverage, listing transparency, seller protection, and
// service-history/known-defects modifiers to Deal Score and Data Confidence.
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
          fuelType: true,
          transmission: true,
          bodyStyle: true,
          drivetrain: true,
          generation: true,
          facelift: true,
          trim: true,
          performanceVariant: true,
          modelYear: true,
          horsepower: true,
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
  const calculatedAt = new Date();

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
      vehicle."drivetrain" AS "drivetrain",
      vehicle."facelift" AS "facelift",
      vehicle."trim" AS "trim",
      vehicle."performanceVariant" AS "performanceVariant",
      vehicle."modelYear" AS "modelYear",
      vehicle."horsepower" AS "horsepower",
      listing."mileageKm" AS "mileageKm",
      listing."priceAmount" AS "priceAmount",
      listing."sellerType" AS "sellerType",
      listing."synchronizedAt" AS "synchronizedAt"
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

  function toSimilarityTarget(target: AnalysisTarget): SimilarityTarget {
    return {
      fuelType: target.vehicle.fuelType,
      transmission: target.vehicle.transmission,
      drivetrain: target.vehicle.drivetrain,
      bodyStyle: target.vehicle.bodyStyle,
      generation: target.vehicle.generation,
      facelift: target.vehicle.facelift,
      trim: target.vehicle.trim,
      performanceVariant: target.vehicle.performanceVariant,
      modelYear: target.vehicle.modelYear,
      mileageKm: target.mileageKm,
      sellerType: target.sellerType,
    };
  }

  function toSimilarityCandidate(row: MarketComparableRow): SimilarityCandidate {
    return {
      fuelType: row.fuelType,
      transmission: row.transmission,
      drivetrain: row.drivetrain,
      bodyStyle: row.bodyStyle,
      generation: row.generation,
      facelift: row.facelift,
      trim: row.trim,
      performanceVariant: row.performanceVariant,
      modelYear: row.modelYear,
      mileageKm: Number(row.mileageKm),
      sellerType: row.sellerType,
      observedAt: row.synchronizedAt,
    };
  }

  interface ScoredCandidate {
    row: MarketComparableRow;
    score: number;
    tier: ComparableTier;
    reasons: readonly string[];
    /** similarity tier weight x recency decay — this is what feeds `valueVehicle`. */
    weight: number;
  }

  interface TierCounts {
    A: number;
    B: number;
    C: number;
    D: number;
  }

  // A vehicle "kind" compatibility gate (passenger car vs van/camper/etc.),
  // from Deal Score v11 — layered in front of the similarity score so a
  // mis-bodied listing never becomes a comparable no matter how it scores.
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

  /**
   * Same-model candidates scored by similarity (generation, facelift,
   * drivetrain, trim, performance variant, body, year/mileage proximity,
   * seller type, recency — see `comparable-similarity.ts`) instead of the
   * old boolean tier cascade. A different fuel type or an incompatible
   * vehicle kind are still hard exclusions; everything else becomes a
   * weight, never an on/off gate, which is what lets a thin exact cohort be
   * widened with weak context instead of either starving or being diluted
   * flat.
   */
  function scoreSameModelCandidates(target: AnalysisTarget): ScoredCandidate[] {
    const similarityTarget = toSimilarityTarget(target);
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          comparable.vehicleId !== target.vehicleId &&
          compatibleKind(targetKind, kindOf(comparable)),
      )
      .map((row) => {
        const result = scoreComparable(similarityTarget, toSimilarityCandidate(row), calculatedAt);
        const weight = result.hardReject
          ? 0
          : tierWeight(result.tier) * recencyDecayFactor(row.synchronizedAt, calculatedAt);
        return { row, score: result.score, tier: result.tier, reasons: result.reasons, weight, hardReject: result.hardReject };
      })
      .filter((c) => !c.hardReject);
  }

  /**
   * Hierarchical cohort (Tier A -> A+B -> A+B+C -> A+B+C+D): widen only as
   * far as needed for a real local fit, so a strong exact cohort never gets
   * diluted by weak context it doesn't need, while a sparse one still gets
   * to use everything available rather than falling straight to a
   * cross-model segment. `widestTierUsed` is the loosest tier actually
   * pulled in, used downstream only to describe cohort strength for Data
   * Confidence — it does not affect which comparables are selected.
   */
  function pickCohort(
    scored: readonly ScoredCandidate[],
  ): { pool: ScoredCandidate[]; tierCounts: TierCounts; widestTierUsed: ComparableTier | null } {
    const byTier: Record<ComparableTier, ScoredCandidate[]> = { A: [], B: [], C: [], D: [] };
    for (const c of scored) byTier[c.tier].push(c);
    let pool: ScoredCandidate[] = [];
    let widestTierUsed: ComparableTier | null = null;
    for (const tier of ["A", "B", "C", "D"] as const) {
      pool = pool.concat(byTier[tier]);
      if (byTier[tier].length > 0) widestTierUsed = tier;
      if (pool.length >= MIN_FIT_COMPARABLES) break;
    }
    return {
      pool,
      tierCounts: { A: byTier.A.length, B: byTier.B.length, C: byTier.C.length, D: byTier.D.length },
      widestTierUsed,
    };
  }

  // Only vehicles with no usable same-family pool at all fall through to same-make.
  const scoredByTarget = new Map<string, ScoredCandidate[]>();
  const needsSegmentFallback = targets.filter((target) => {
    const scored = scoreSameModelCandidates(target);
    scoredByTarget.set(target.id, scored);
    return scored.length < MIN_COMPARABLES;
  });
  const segmentMakes = [
    ...new Set(needsSegmentFallback.map(({ vehicle }) => vehicle.make)),
  ];
  const segmentComparableRows = segmentMakes.length
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
          vehicle."drivetrain" AS "drivetrain",
          vehicle."facelift" AS "facelift",
          vehicle."trim" AS "trim",
          vehicle."performanceVariant" AS "performanceVariant",
          vehicle."modelYear" AS "modelYear",
          vehicle."horsepower" AS "horsepower",
          listing."mileageKm" AS "mileageKm",
          listing."priceAmount" AS "priceAmount",
          listing."sellerType" AS "sellerType",
          listing."synchronizedAt" AS "synchronizedAt"
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
  for (const comparable of segmentComparableRows) {
    const key = segmentKey(comparable);
    const rows = comparablesBySegment.get(key) ?? [];
    rows.push(comparable);
    comparablesBySegment.set(key, rows);
  }

  /** Cross-model, same-make fallback for cars with no usable same-family pool
   *  at all — a coarse, flat-weight, price-banded context, never treated as
   *  a strong cohort (see `usedSegmentFallback` below). */
  function segmentComparables(target: AnalysisTarget): { comparables: ValuationComparable[]; rows: SegmentComparableRow[] } {
    const minimumPrice = target.priceAmount * 0.6;
    const maximumPrice = target.priceAmount * 1.4;
    const targetKind = kindOf({ ...target.vehicle, title: target.title });
    const rows = (comparablesBySegment.get(segmentKey(target.vehicle)) ?? []).filter(
      (comparable) =>
        comparable.id !== target.id &&
        comparable.vehicleId !== target.vehicleId &&
        compatibleKind(targetKind, kindOf(comparable)) &&
        comparable.fuelType === target.vehicle.fuelType &&
        Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 5 &&
        Number(comparable.priceAmount) >= minimumPrice &&
        Number(comparable.priceAmount) <= maximumPrice,
    );
    const SEGMENT_FALLBACK_WEIGHT = 0.2;
    const comparables = rows.map((row) => ({
      priceAmount: Number(row.priceAmount),
      ageYears: analysisYear - row.modelYear,
      mileageKm: Number(row.mileageKm),
      weight: SEGMENT_FALLBACK_WEIGHT * recencyDecayFactor(row.synchronizedAt, calculatedAt),
    }));
    return { comparables, rows };
  }

  interface ComparableInsight {
    priceAmount: number;
    modelYear: number;
    mileageKm: number;
    sellerType: string | null;
    tier: ComparableTier;
    score: number;
    reasons: readonly string[];
  }

  const MAX_INSIGHTS = 8;

  // Coarse cohort-strength label for Data Confidence (Deal Score v11's
  // formula), derived from the similarity tiers actually needed to fill the
  // cohort rather than from a separate boolean cascade.
  type CohortStrength = "exact" | "wide" | "same_fuel" | "segment" | "none";

  const contexts = targets.map((target) => {
    const scored = scoredByTarget.get(target.id) ?? [];
    const { pool, tierCounts, widestTierUsed } = pickCohort(scored);

    let usedSegmentFallback = false;
    let cohortRows: MarketComparableRow[];
    let cohort: ValuationComparable[];
    let tierCountsUsed: TierCounts;
    let comparableInsights: ComparableInsight[];
    let strength: CohortStrength;

    if (pool.length >= MIN_COMPARABLES) {
      cohortRows = pool.map((c) => c.row);
      cohort = pool.map((c) => ({
        priceAmount: Number(c.row.priceAmount),
        ageYears: analysisYear - c.row.modelYear,
        mileageKm: Number(c.row.mileageKm),
        weight: c.weight,
      }));
      tierCountsUsed = tierCounts;
      comparableInsights = [...pool]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_INSIGHTS)
        .map((c) => ({
          priceAmount: Number(c.row.priceAmount),
          modelYear: c.row.modelYear,
          mileageKm: Number(c.row.mileageKm),
          sellerType: c.row.sellerType,
          tier: c.tier,
          score: c.score,
          reasons: c.reasons,
        }));
      strength = widestTierUsed === "A" ? "exact" : widestTierUsed === "B" ? "wide" : "same_fuel";
    } else {
      usedSegmentFallback = true;
      const segment = segmentComparables(target);
      cohortRows = segment.rows;
      cohort = segment.comparables;
      tierCountsUsed = { A: 0, B: 0, C: 0, D: segment.comparables.length };
      comparableInsights = segment.rows.slice(0, MAX_INSIGHTS).map((row) => ({
        priceAmount: Number(row.priceAmount),
        modelYear: row.modelYear,
        mileageKm: Number(row.mileageKm),
        sellerType: null,
        tier: "D" as const,
        score: 0,
        reasons: ["Same make, different model — broader market context only"],
      }));
      strength = cohortRows.length > 0 ? "segment" : "none";
    }

    const ageYears = Math.max(0, analysisYear - target.vehicle.modelYear);
    let valuation = valueVehicle({ ageYears, mileageKm: target.mileageKm }, cohort);
    let valuationSanity: Record<string, unknown> = { suspicious: false, recalculated: false };
    if (
      valuation.marketValue &&
      (valuation.marketValue > target.priceAmount * 1.8 || valuation.marketValue < target.priceAmount * 0.55)
    ) {
      const strictRows = cohortRows.filter((row) => {
        const sameGeneration = !target.vehicle.generation || !row.generation || row.generation === target.vehicle.generation;
        const sameDrivetrain = !target.vehicle.drivetrain || !row.drivetrain || row.drivetrain === target.vehicle.drivetrain;
        const powerCompatible =
          !target.vehicle.horsepower ||
          !row.horsepower ||
          Math.abs(row.horsepower - target.vehicle.horsepower) / target.vehicle.horsepower <= 0.25;
        return row.fuelType === target.vehicle.fuelType &&
          sameGeneration &&
          sameDrivetrain &&
          powerCompatible &&
          Math.abs(row.modelYear - target.vehicle.modelYear) <= 2 &&
          Math.abs(Number(row.mileageKm) - target.mileageKm) <= 60_000;
      });
      const strict = strictRows.map((row) => ({
        priceAmount: Number(row.priceAmount),
        ageYears: analysisYear - row.modelYear,
        mileageKm: Number(row.mileageKm),
      }));
      const recalculated = valueVehicle({ ageYears, mileageKm: target.mileageKm }, strict);
      valuationSanity = {
        suspicious: true,
        reason: "market value far from asking price",
        checks: ["fuel type", "generation", "drivetrain", "horsepower", "model year", "mileage"],
        strictComparableCount: recalculated.comparableCount,
        recalculated: recalculated.marketValue !== null,
      };
      if (recalculated.marketValue !== null) {
        valuation = recalculated;
        cohortRows = strictRows;
        cohort = strict;
      }
    }
    // Nearest 40 by year/mileage closeness — bounds the equipment-comparison
    // query for a popular model without needing the whole cohort.
    const equipmentCohort = [...cohortRows]
      .sort(
        (a, b) =>
          Math.abs(a.modelYear - target.vehicle.modelYear) * 60_000 +
          Math.abs(Number(a.mileageKm) - target.mileageKm) -
          (Math.abs(b.modelYear - target.vehicle.modelYear) * 60_000 +
            Math.abs(Number(b.mileageKm) - target.mileageKm)),
      )
      .slice(0, 40);

    return {
      target,
      strength,
      cohortRows,
      cohort,
      equipmentCohort,
      ageYears,
      valuation,
      tierCountsUsed,
      usedSegmentFallback,
      comparableInsights,
      valuationSanity,
    };
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

  await prisma.$transaction(
    contexts.map(
      ({ target, strength, cohortRows, cohort, equipmentCohort, ageYears, valuation, tierCountsUsed, usedSegmentFallback, comparableInsights }) => {
        const weightedPrices = cohort.map((c) => ({ value: c.priceAmount, weight: c.weight ?? 1 }));
        const dispersionMedian = weightedPrices.length ? weightedMedian(weightedPrices) : 0;
        const priceDispersionRatio =
          dispersionMedian > 0
            ? (weightedPercentile(weightedPrices, 0.75) - weightedPercentile(weightedPrices, 0.25)) / dispersionMedian
            : NaN;
        const valuationConfidence =
          valuation.marketValue === null
            ? null
            : computeValuationConfidence({
                tierACount: tierCountsUsed.A,
                tierBCount: tierCountsUsed.B,
                tierCCount: tierCountsUsed.C,
                tierDCount: tierCountsUsed.D,
                method: valuation.method,
                usedSegmentFallback,
                priceDispersionRatio,
              });

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

        const providers = new Set(cohortRows.map(({ provider }) => provider)).size;
        const generationMatches = target.vehicle.generation
          ? cohortRows.filter(({ generation }) => generation === target.vehicle.generation).length /
            Math.max(1, cohortRows.length)
          : 0.5;
        const dispersion =
          valuation.marketValue && valuation.rangeLow && valuation.rangeHigh
            ? (valuation.rangeHigh - valuation.rangeLow) / valuation.marketValue
            : 1;
        const strengthPoints: Record<CohortStrength, number> = {
          exact: 24,
          wide: 16,
          same_fuel: 10,
          segment: 0,
          none: -20,
        };
        let confidenceScore =
          Math.min(25, valuation.comparableCount * 2) +
          strengthPoints[strength] +
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
          valuationConfidenceScore: valuationConfidence?.score ?? null,
          valuationConfidenceLabel: valuationConfidence?.label ?? null,
          comparableInsights: comparableInsights as unknown as Prisma.InputJsonValue,
          valuationSanity: context.valuationSanity as unknown as Prisma.InputJsonValue,
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
      },
    ),
    { timeout: 60_000 },
  );

  return targets.length;
}
