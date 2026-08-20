import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

interface AnalysisTarget {
  id: string;
  priceAmount: number;
  mileageKm: number;
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
  bodyStyle: string;
  modelYear: number;
  mileageKm: number;
  priceAmount: number;
}

const methodologyVersion = "value-quality-composite-2.0";

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
  const dealScore = clampScore(
    priceValueScore * 0.45 +
      ageScore * 0.25 +
      mileageScore * 0.2 +
      affordabilityScore * 0.1,
  );
  const buyConfidenceScore = clampScore(
    dealScore * 0.65 + ageScore * 0.2 + mileageScore * 0.15,
  );

  return { dealScore, buyConfidenceScore };
}

function cohortKey({
  make,
  model,
  fuelType,
  transmission,
  bodyStyle,
}: {
  make: string;
  model: string;
  fuelType: string;
  transmission: string;
  bodyStyle: string;
}) {
  return JSON.stringify([make, model, fuelType, transmission, bodyStyle]);
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
      "make", "model", "fuelType", "transmission", "bodyStyle"
    ) AS (
      VALUES ${Prisma.join(
        cohorts.map(
          (vehicle) =>
            Prisma.sql`(${vehicle.make}, ${vehicle.model}, ${vehicle.fuelType}, ${vehicle.transmission}, ${vehicle.bodyStyle})`,
        ),
      )}
    )
    SELECT
      listing."id" AS "id",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      vehicle."fuelType" AS "fuelType",
      vehicle."transmission" AS "transmission",
      vehicle."bodyStyle" AS "bodyStyle",
      vehicle."modelYear" AS "modelYear",
      listing."mileageKm" AS "mileageKm",
      listing."priceAmount" AS "priceAmount"
    FROM "target_cohorts" AS cohort
    INNER JOIN "VehicleRecord" AS vehicle
      ON vehicle."make" = cohort."make"
      AND vehicle."model" = cohort."model"
      AND vehicle."fuelType" = cohort."fuelType"
      AND vehicle."transmission" = cohort."transmission"
      AND vehicle."bodyStyle" = cohort."bodyStyle"
    INNER JOIN "ListingRecord" AS listing
      ON listing."vehicleId" = vehicle."id"
      AND listing."status" = 'active'
    WHERE listing."priceAmount" > 0
  `);
  const comparablesByCohort = new Map<string, MarketComparableRow[]>();
  for (const comparable of comparables) {
    const key = cohortKey(comparable);
    const rows = comparablesByCohort.get(key) ?? [];
    rows.push(comparable);
    comparablesByCohort.set(key, rows);
  }

  const calculatedAt = new Date();
  await prisma.$transaction(
    targets.map((target) => {
      const prices = (comparablesByCohort.get(cohortKey(target.vehicle)) ?? [])
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
        .slice(0, 25)
        .map(({ priceAmount }) => Number(priceAmount))
        .toSorted((left, right) => left - right);
      const hasEstimate = prices.length >= 3;
      const marketValue = hasEstimate
        ? roundedThousands(percentile(prices, 0.5))
        : target.priceAmount;
      const priceDelta =
        marketValue > 0 ? (marketValue - target.priceAmount) / marketValue : 0;
      const confidence =
        prices.length >= 15 ? "high" : prices.length >= 8 ? "medium" : "low";
      const fuelMultiplier = target.vehicle.fuelType === "electric" ? 0.8 : 1;
      const qualityScores = vehicleQualityScores(
        target,
        hasEstimate ? priceDelta : 0,
        calculatedAt.getFullYear(),
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
        confidence,
        dealScore: qualityScores.dealScore,
        buyConfidenceScore: qualityScores.buyConfidenceScore,
        annualOwnershipCost: Math.round(
          (34_000 + target.priceAmount * 0.065) * fuelMultiplier,
        ),
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
  );

  return targets.length;
}
