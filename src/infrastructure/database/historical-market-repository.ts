import {
  MARKET_NORMALIZATION_VERSION,
  addUtcDays,
  marketCohortCandidates,
  startOfUtcDay,
  type HistoricalMarketSelection,
  type MarketCohortCandidate,
} from "@/domain/market/historical-market";
import { initializeDatabase, prisma } from "./prisma";

const referenceDays = [30, 90, 180, 365] as const;

export interface HistoricalMarketPoint {
  date: string;
  activeInventory: number;
  medianPriceAmount: number;
  averagePriceAmount: number;
  priceP10Amount: number;
  priceP25Amount: number;
  priceP75Amount: number;
  priceP90Amount: number;
  medianMileageKm: number;
  medianDaysOnMarket: number;
  newListingCount: number;
  reactivatedListingCount: number;
  removedListingCount: number;
  priceReductionCount: number;
  priceReductionShare: number;
  medianPriceReductionAmount: number | null;
}

export interface HistoricalMarketReference {
  daysAgo: (typeof referenceDays)[number];
  point: HistoricalMarketPoint | null;
  priceChangeAmount: number | null;
  priceChangePercent: number | null;
  inventoryChange: number | null;
  inventoryChangePercent: number | null;
}

export interface HistoricalMarketTrend {
  requested: HistoricalMarketSelection;
  resolvedCohort: MarketCohortCandidate;
  usedFallback: boolean;
  currency: "SEK";
  latest: HistoricalMarketPoint;
  references: readonly HistoricalMarketReference[];
  points: readonly HistoricalMarketPoint[];
}

export interface HistoricalMarketTrendOptions {
  from?: Date;
  to?: Date;
}

type SnapshotRow = Awaited<
  ReturnType<typeof prisma.marketSnapshot.findMany>
>[number];

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toPoint(row: SnapshotRow): HistoricalMarketPoint {
  return {
    date: dateKey(row.snapshotDate),
    activeInventory: row.activeListingCount,
    medianPriceAmount: row.medianPriceAmount,
    averagePriceAmount: row.averagePriceAmount,
    priceP10Amount: row.priceP10Amount,
    priceP25Amount: row.priceP25Amount,
    priceP75Amount: row.priceP75Amount,
    priceP90Amount: row.priceP90Amount,
    medianMileageKm: row.medianMileageKm,
    medianDaysOnMarket: row.medianDaysOnMarket,
    newListingCount: row.newListingCount,
    reactivatedListingCount: row.reactivatedListingCount,
    removedListingCount: row.removedListingCount,
    priceReductionCount: row.priceReductionCount,
    priceReductionShare: row.priceReductionShare,
    medianPriceReductionAmount: row.medianPriceReductionAmount,
  };
}

function percentageChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

/**
 * Reads precomputed daily history only. It never reconstructs events during a
 * request. When a detailed cohort is below the snapshot minimum, the lookup
 * walks the documented hierarchy back to make+model.
 */
export async function getHistoricalMarketTrend(
  selection: HistoricalMarketSelection,
  options: HistoricalMarketTrendOptions = {},
): Promise<HistoricalMarketTrend | null> {
  await initializeDatabase();
  const requestedTo = startOfUtcDay(options.to ?? new Date());
  const latestAvailable = await prisma.marketSnapshot.findFirst({
    where: { snapshotDate: { lte: requestedTo } },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: "desc" },
  });
  if (!latestAvailable) return null;

  const targetDate = latestAvailable.snapshotDate;
  const candidates = marketCohortCandidates(selection);
  let resolved:
    | { candidate: MarketCohortCandidate; cohortId: bigint }
    | undefined;
  for (const candidate of candidates) {
    const cohort = await prisma.marketCohort.findFirst({
      where: {
        normalizationVersion: MARKET_NORMALIZATION_VERSION,
        granularity: candidate.granularity,
        make: candidate.make,
        model: candidate.model,
        fuelType: candidate.fuelType ?? null,
        transmission: candidate.transmission ?? null,
        modelYear: candidate.modelYear ?? null,
        mileageBucket: candidate.mileageBucket ?? null,
        snapshots: { some: { snapshotDate: targetDate } },
      },
      select: { id: true },
    });
    if (cohort) {
      resolved = { candidate, cohortId: cohort.id };
      break;
    }
  }
  if (!resolved) return null;

  const defaultFrom = addUtcDays(targetDate, -365);
  const requestedFrom = startOfUtcDay(options.from ?? defaultFrom);
  const readFrom =
    requestedFrom < defaultFrom ? requestedFrom : defaultFrom;
  const rows = await prisma.marketSnapshot.findMany({
    where: {
      cohortId: resolved.cohortId,
      snapshotDate: { gte: readFrom, lte: targetDate },
    },
    orderBy: { snapshotDate: "asc" },
  });
  const latestRow = rows.at(-1);
  if (!latestRow) return null;
  const latest = toPoint(latestRow);

  const references = referenceDays.map((daysAgo) => {
    const referenceDate = addUtcDays(targetDate, -daysAgo);
    const row = rows.findLast(
      (candidate) => candidate.snapshotDate <= referenceDate,
    );
    const point = row ? toPoint(row) : null;
    return {
      daysAgo,
      point,
      priceChangeAmount: point
        ? latest.medianPriceAmount - point.medianPriceAmount
        : null,
      priceChangePercent: point
        ? percentageChange(latest.medianPriceAmount, point.medianPriceAmount)
        : null,
      inventoryChange: point
        ? latest.activeInventory - point.activeInventory
        : null,
      inventoryChangePercent: point
        ? percentageChange(latest.activeInventory, point.activeInventory)
        : null,
    } satisfies HistoricalMarketReference;
  });

  return {
    requested: selection,
    resolvedCohort: resolved.candidate,
    usedFallback: resolved.candidate.granularity !== candidates[0].granularity,
    currency: "SEK",
    latest,
    references,
    points: rows
      .filter((row) => row.snapshotDate >= requestedFrom)
      .map(toPoint),
  };
}
