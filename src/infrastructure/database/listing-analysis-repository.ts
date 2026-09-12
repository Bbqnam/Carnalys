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
  synchronizedAt: Date;
  sellerType: string;
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
}

interface MarketComparableRow {
  id: string;
  vehicleId: string;
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
  mileageKm: number;
  priceAmount: number;
  sellerType: string;
  synchronizedAt: Date;
}

interface SegmentComparableRow {
  id: string;
  vehicleId: string;
  make: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
  synchronizedAt: Date;
}

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
      sellerType: true,
      vehicle: {
        select: {
          make: true,
          model: true,
          fuelType: true,
          transmission: true,
          bodyStyle: true,
          drivetrain: true,
          generation: true,
          facelift: true,
          trim: true,
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
      vehicle."drivetrain" AS "drivetrain",
      vehicle."generation" AS "generation",
      vehicle."facelift" AS "facelift",
      vehicle."trim" AS "trim",
      vehicle."performanceVariant" AS "performanceVariant",
      vehicle."modelYear" AS "modelYear",
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

  const calculatedAt = new Date();

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

  /**
   * Same-model candidates scored by similarity (generation, facelift,
   * drivetrain, trim, performance variant, body, year/mileage proximity,
   * seller type, recency — see `comparable-similarity.ts`) instead of the
   * old boolean tier cascade. A different fuel type is still a hard
   * exclusion; everything else becomes a weight, never an on/off gate, which
   * is what lets a thin exact cohort be widened with weak context instead of
   * either starving or being diluted flat.
   */
  function scoreSameModelCandidates(target: AnalysisTarget): ScoredCandidate[] {
    const similarityTarget = toSimilarityTarget(target);
    return (comparablesByModel.get(modelKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id && comparable.vehicleId !== target.vehicleId,
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
   * cross-model segment.
   */
  function pickCohort(scored: readonly ScoredCandidate[]): { pool: ScoredCandidate[]; tierCounts: TierCounts } {
    const byTier: Record<ComparableTier, ScoredCandidate[]> = { A: [], B: [], C: [], D: [] };
    for (const c of scored) byTier[c.tier].push(c);
    let pool: ScoredCandidate[] = [];
    for (const tier of ["A", "B", "C", "D"] as const) {
      pool = pool.concat(byTier[tier]);
      if (pool.length >= MIN_FIT_COMPARABLES) break;
    }
    return {
      pool,
      tierCounts: { A: byTier.A.length, B: byTier.B.length, C: byTier.C.length, D: byTier.D.length },
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
          listing."vehicleId" AS "vehicleId",
          vehicle."make" AS "make",
          vehicle."modelYear" AS "modelYear",
          listing."mileageKm" AS "mileageKm",
          listing."priceAmount" AS "priceAmount",
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
    const rows = (comparablesBySegment.get(segmentKey(target.vehicle)) ?? []).filter(
      (comparable) =>
        comparable.id !== target.id &&
        comparable.vehicleId !== target.vehicleId &&
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

  await prisma.$transaction(
    targets.map((target) => {
      const scored = scoredByTarget.get(target.id) ?? [];
      const { pool, tierCounts } = pickCohort(scored);

      let usedSegmentFallback = false;
      let cohort: ValuationComparable[];
      let tierCountsUsed: TierCounts;
      let comparableInsights: ComparableInsight[];

      if (pool.length >= MIN_COMPARABLES) {
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
      } else {
        usedSegmentFallback = true;
        const segment = segmentComparables(target);
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
      }

      const valuation = valueVehicle(
        {
          ageYears: analysisYear - target.vehicle.modelYear,
          mileageKm: target.mileageKm,
        },
        cohort,
      );

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
              usedSegmentFallback ||
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
        valuationConfidenceScore: valuationConfidence?.score ?? null,
        valuationConfidenceLabel: valuationConfidence?.label ?? null,
        comparableInsights: comparableInsights as unknown as Prisma.InputJsonValue,
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
