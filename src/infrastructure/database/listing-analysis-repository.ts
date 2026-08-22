import { Prisma } from "@/generated/prisma/client";
import { buildOwnershipCostItems } from "@/domain/vehicle/analysis/ownership-cost-items";
import {
  buildBuyConfidenceFactors,
  buildDealScoreFactors,
} from "@/domain/vehicle/analysis/score-factors";
import { initializeDatabase, prisma } from "./prisma";

interface AnalysisTarget {
  id: string;
  priceAmount: number;
  mileageKm: number;
  ownerCount: number | null;
  synchronizedAt: Date;
  vehicle: {
    make: string;
    model: string;
    fuelType: string;
    transmission: string;
    bodyStyle: string;
    modelYear: number;
  };
}

interface MarketComparableRow {
  id: string;
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
}

interface SegmentComparableRow {
  id: string;
  make: string;
  modelYear: number;
  priceAmount: number;
}

const methodologyVersion = "value-quality-composite-8.0";

// A broken/placeholder scrape (price 0, 1 kr, etc.) has no floor otherwise,
// and a single one of these landing in a small comparable pool (common for
// the "low confidence" cohorts this feeds) can badly skew the percentile-
// based market value range. No legitimate running car is priced this low.
const minimumSaneComparablePrice = 5_000;

function clampScore(value: number) {
  return Math.max(10, Math.min(95, Math.round(value)));
}

function interpolateScore(
  value: number,
  points: readonly (readonly [number, number])[],
) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [upperValue, upperScore] = points[index];
    const [lowerValue, lowerScore] = points[index - 1];
    if (value <= upperValue) {
      const ratio = (value - lowerValue) / (upperValue - lowerValue);
      return lowerScore + (upperScore - lowerScore) * ratio;
    }
  }
  return points.at(-1)?.[1] ?? 10;
}

function vehicleQualityScores(target: AnalysisTarget, priceDelta: number, year: number) {
  const age = Math.max(0, year - target.vehicle.modelYear);
  const priceValueScore = clampScore(65 + priceDelta * 140);
  const ageScore = interpolateScore(age, [
    [0, 100], [1, 100], [3, 92], [5, 82], [8, 68],
    [12, 50], [18, 30], [25, 15], [40, 10],
  ]);
  const mileageScore = interpolateScore(target.mileageKm, [
    [0, 100], [30_000, 92], [60_000, 80], [100_000, 65],
    [150_000, 45], [200_000, 28], [300_000, 10], [500_000, 10],
  ]);
  const affordabilityScore = interpolateScore(target.priceAmount, [
    [0, 100], [75_000, 95], [150_000, 85], [250_000, 70],
    [400_000, 50], [600_000, 32], [1_000_000, 15], [2_000_000, 10],
  ]);
  // Unknown owner count is treated as neutral (2 owners) rather than
  // penalized, since it's genuinely absent for a lot of listings.
  const ownerScore = interpolateScore(target.ownerCount ?? 2, [
    [1, 100], [2, 80], [3, 60], [4, 45], [5, 30], [8, 15],
  ]);
  const dealScore = clampScore(
    priceValueScore * 0.45 +
      ageScore * 0.25 +
      mileageScore * 0.2 +
      affordabilityScore * 0.1,
  );
  // Deliberately independent of dealScore/price — Deal Score answers "is
  // this priced well," Buy Confidence answers "is this a sound car to
  // own," driven purely by condition (age/mileage) and ownership history.
  const buyConfidenceScore = clampScore(
    ageScore * 0.4 + mileageScore * 0.35 + ownerScore * 0.25,
  );

  return {
    dealScore,
    buyConfidenceScore,
    age,
    priceValueScore,
    ageScore,
    mileageScore,
    affordabilityScore,
    ownerScore,
  };
}

// Note: deliberately excludes bodyStyle. It's only populated from detail
// data (see importer.ts), so during the transition while most of the
// catalog is still un-enriched, requiring an exact bodyStyle match would
// isolate freshly-enriched listings from the (still-"other") bulk of their
// own real comparables.
function cohortKey({
  make,
  model,
  fuelType,
  transmission,
}: {
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
}) {
  return JSON.stringify([make, model, fuelType, transmission]);
}

function segmentKey({ make }: { make: string }) {
  return make;
}

function roundedThousands(value: number) {
  return Math.max(1_000, Math.round(value / 1_000) * 1_000);
}

function percentile(sortedValues: readonly number[], fraction: number) {
  const position = (sortedValues.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

const comparableDisplaySampleSize = 40;

// The median/percentile math uses every matching comparable — no cap, for
// statistical accuracy. Storing (and rendering) all of them isn't
// reasonable once a popular cohort has 1,000+ active listings, so the
// *display* sample is a separate, bounded, evenly-spaced pick across the
// sorted full set — this preserves the true shape of the distribution
// (including its extremes) rather than just showing e.g. the cheapest N.
function evenlySampled(sortedValues: readonly number[], sampleSize: number) {
  if (sortedValues.length <= sampleSize) return sortedValues;
  const step = (sortedValues.length - 1) / (sampleSize - 1);
  return Array.from(
    { length: sampleSize },
    (_, index) => sortedValues[Math.round(index * step)],
  );
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
      priceAmount: true,
      mileageKm: true,
      ownerCount: true,
      synchronizedAt: true,
      vehicle: {
        select: {
          make: true,
          model: true,
          fuelType: true,
          transmission: true,
          bodyStyle: true,
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

  const cohorts = [
    ...new Map(
      targets.map(({ vehicle }) => [cohortKey(vehicle), vehicle] as const),
    ).values(),
  ];
  const comparables = await prisma.$queryRaw<MarketComparableRow[]>(Prisma.sql`
    WITH "target_cohorts" (
      "make", "model", "fuelType", "transmission"
    ) AS (
      VALUES ${Prisma.join(
        cohorts.map(
          (vehicle) =>
            Prisma.sql`(${vehicle.make}, ${vehicle.model}, ${vehicle.fuelType}, ${vehicle.transmission})`,
        ),
      )}
    )
    SELECT
      listing."id" AS "id",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      vehicle."fuelType" AS "fuelType",
      vehicle."transmission" AS "transmission",
      vehicle."modelYear" AS "modelYear",
      listing."mileageKm" AS "mileageKm",
      listing."priceAmount" AS "priceAmount"
    FROM "target_cohorts" AS cohort
    INNER JOIN "VehicleRecord" AS vehicle
      ON vehicle."make" = cohort."make"
      AND vehicle."model" = cohort."model"
      AND vehicle."fuelType" = cohort."fuelType"
      AND vehicle."transmission" = cohort."transmission"
    INNER JOIN "ListingRecord" AS listing
      ON listing."vehicleId" = vehicle."id"
      AND listing."status" = 'active'
    WHERE listing."priceAmount" >= ${minimumSaneComparablePrice}
  `);
  const comparablesByCohort = new Map<string, MarketComparableRow[]>();
  for (const comparable of comparables) {
    const key = cohortKey(comparable);
    const rows = comparablesByCohort.get(key) ?? [];
    rows.push(comparable);
    comparablesByCohort.set(key, rows);
  }

  function tier1Prices(target: AnalysisTarget) {
    return (comparablesByCohort.get(cohortKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 3 &&
          Math.abs(comparable.mileageKm - target.mileageKm) <= 120_000,
      )
      .toSorted(
        (left, right) =>
          Math.abs(left.modelYear - target.vehicle.modelYear) * 60_000 +
            Math.abs(left.mileageKm - target.mileageKm) -
            (Math.abs(right.modelYear - target.vehicle.modelYear) * 60_000 +
              Math.abs(right.mileageKm - target.mileageKm)),
      )
      .map(({ priceAmount }) => Number(priceAmount));
  }

  // Rare/exotic vehicles (e.g. a Ferrari) rarely have 3+ exact make+model
  // matches, so their price signal would otherwise always fall back to a
  // flat neutral score. For those, widen to same-make (a looser but still
  // meaningful comparison) instead of giving up.
  const needsSegmentFallback = targets.filter(
    (target) => tier1Prices(target).length < 3,
  );
  const segmentMakes = [
    ...new Set(needsSegmentFallback.map(({ vehicle }) => vehicle.make)),
  ];
  const segmentComparables = segmentMakes.length
    ? await prisma.$queryRaw<SegmentComparableRow[]>(Prisma.sql`
        SELECT
          listing."id" AS "id",
          vehicle."make" AS "make",
          vehicle."modelYear" AS "modelYear",
          listing."priceAmount" AS "priceAmount"
        FROM "VehicleRecord" AS vehicle
        INNER JOIN "ListingRecord" AS listing
          ON listing."vehicleId" = vehicle."id"
          AND listing."status" = 'active'
        WHERE vehicle."make" IN (${Prisma.join(segmentMakes)})
          AND listing."priceAmount" > 0
      `)
    : [];
  const comparablesBySegment = new Map<string, SegmentComparableRow[]>();
  for (const comparable of segmentComparables) {
    const key = segmentKey(comparable);
    const rows = comparablesBySegment.get(key) ?? [];
    rows.push(comparable);
    comparablesBySegment.set(key, rows);
  }

  function tier2Prices(target: AnalysisTarget) {
    const minimumPrice = target.priceAmount * 0.6;
    const maximumPrice = target.priceAmount * 1.4;
    return (comparablesBySegment.get(segmentKey(target.vehicle)) ?? [])
      .filter(
        (comparable) =>
          comparable.id !== target.id &&
          Math.abs(comparable.modelYear - target.vehicle.modelYear) <= 5 &&
          comparable.priceAmount >= minimumPrice &&
          comparable.priceAmount <= maximumPrice,
      )
      .toSorted(
        (left, right) =>
          Math.abs(left.modelYear - target.vehicle.modelYear) -
          Math.abs(right.modelYear - target.vehicle.modelYear),
      )
      .map(({ priceAmount }) => Number(priceAmount));
  }

  const calculatedAt = new Date();
  await prisma.$transaction(
    targets.map((target) => {
      const tier1 = tier1Prices(target);
      const usedFallbackTier = tier1.length < 3;
      const prices = (usedFallbackTier ? tier2Prices(target) : tier1).toSorted(
        (left, right) => left - right,
      );
      const hasEstimate = prices.length >= 3;
      const marketValue = hasEstimate
        ? roundedThousands(percentile(prices, 0.5))
        : target.priceAmount;
      const priceDelta =
        marketValue > 0 ? (marketValue - target.priceAmount) / marketValue : 0;
      const confidence =
        !hasEstimate || usedFallbackTier
          ? "low"
          : prices.length >= 15
            ? "high"
            : prices.length >= 8
              ? "medium"
              : "low";
      const fuelMultiplier = target.vehicle.fuelType === "electric" ? 0.8 : 1;
      const qualityScores = vehicleQualityScores(
        target,
        hasEstimate ? priceDelta : 0,
        calculatedAt.getFullYear(),
      );
      const factorInputs = {
        hasMarketEstimate: hasEstimate,
        priceDelta: hasEstimate ? priceDelta : 0,
        priceValueScore: qualityScores.priceValueScore,
        ageScore: qualityScores.ageScore,
        mileageScore: qualityScores.mileageScore,
        affordabilityScore: qualityScores.affordabilityScore,
        dealScore: qualityScores.dealScore,
        ownerScore: qualityScores.ownerScore,
        ownerCount: target.ownerCount ?? undefined,
        age: qualityScores.age,
        modelYear: target.vehicle.modelYear,
        mileageKm: target.mileageKm,
        askingPrice: target.priceAmount,
      };
      const annualOwnershipCost = Math.round(
        (34_000 + target.priceAmount * 0.065) * fuelMultiplier,
      );
      const values = {
        marketValueAmount: marketValue,
        marketValueMinimum: hasEstimate
          ? roundedThousands(percentile(prices, 0.25))
          : roundedThousands(target.priceAmount * 0.9),
        marketValueMaximum: hasEstimate
          ? roundedThousands(percentile(prices, 0.75))
          : roundedThousands(target.priceAmount * 1.1),
        comparableCount: prices.length,
        comparablePrices: [...evenlySampled(prices, comparableDisplaySampleSize)],
        confidence,
        dealScore: qualityScores.dealScore,
        dealScoreFactors: buildDealScoreFactors(
          factorInputs,
        ) as unknown as Prisma.InputJsonValue,
        buyConfidenceScore: qualityScores.buyConfidenceScore,
        buyConfidenceFactors: buildBuyConfidenceFactors(
          factorInputs,
        ) as unknown as Prisma.InputJsonValue,
        annualOwnershipCost,
        ownershipCostItems: buildOwnershipCostItems({
          totalAnnualCost: annualOwnershipCost,
          askingPrice: target.priceAmount,
          age: qualityScores.age,
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
    { timeout: 30_000 },
  );

  return targets.length;
}
