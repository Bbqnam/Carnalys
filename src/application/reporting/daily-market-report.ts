import { prisma } from "@/infrastructure/database/prisma";

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

type CountRow = { count: bigint | number };
type AverageRow = { average: number | string | null };
type PriceSummaryRow = {
  count: bigint | number;
  averagePrice: number | string | null;
  minimumPrice: number | null;
  maximumPrice: number | null;
};
type RankedRow = {
  name: string | null;
  count: bigint | number;
  averagePrice: number | string | null;
};
export type VehicleRow = {
  listingId: string;
  make: string;
  model: string;
  variant: string | null;
  modelYear: number;
  drivetrain: string | null;
  transmission: string;
  horsepower: number | null;
  mileageKm: number;
  priceAmount: number;
  sellerName: string | null;
  provider: string;
  disappearedAt: Date;
};
type PriceChangeRow = {
  count: bigint | number;
  reductions: bigint | number;
  increases: bigint | number;
  averageChange: number | string | null;
};
type ImportHealthRow = {
  provider: string;
  runs: bigint | number;
  createdCount: bigint | number;
  updatedCount: bigint | number;
  removedCount: bigint | number;
  failedCount: bigint | number;
  failedRuns: bigint | number;
};

export type DailyMarketReport = {
  reportDate: string;
  start: Date;
  end: Date;
  generatedAt: Date;
  activeListings: number;
  newListings: PriceSummary;
  likelySold: PriceSummary;
  recentDailyAverageNew: number;
  recentDailyAverageLikelySold: number;
  cheapestLikelySold: VehicleRow | null;
  mostExpensiveLikelySold: VehicleRow | null;
  likelySoldVehicles: VehicleRow[];
  topLikelySoldModels: Ranked[];
  topLikelySoldSellers: Ranked[];
  newListingsByProvider: Ranked[];
  activeListingsByProvider: Ranked[];
  priceChanges: {
    count: number;
    reductions: number;
    increases: number;
    averageChange: number;
  };
  importHealth: Array<{
    provider: string;
    runs: number;
    createdCount: number;
    updatedCount: number;
    removedCount: number;
    failedCount: number;
    failedRuns: number;
  }>;
};

type PriceSummary = {
  count: number;
  averagePrice: number;
  minimumPrice: number | null;
  maximumPrice: number | null;
};

type Ranked = {
  name: string;
  count: number;
  averagePrice: number;
};

function number(value: bigint | number | string | null | undefined) {
  return value == null ? 0 : Number(value);
}

function stockholmDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function stockholmOffsetMilliseconds(date: Date) {
  const name = new Intl.DateTimeFormat("en", {
    timeZone: STOCKHOLM_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) throw new Error(`Could not resolve Stockholm offset from ${name}.`);
  const direction = match[1] === "+" ? 1 : -1;
  return direction * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

function stockholmMidnightUtc(year: number, month: number, day: number) {
  const utcMidnight = Date.UTC(year, month - 1, day);
  const offset = stockholmOffsetMilliseconds(new Date(utcMidnight + 12 * 60 * 60_000));
  return new Date(utcMidnight - offset);
}

export function stockholmDay(now = new Date(), daysBack = 1) {
  const today = stockholmDateParts(now);
  const previous = new Date(Date.UTC(today.year, today.month - 1, today.day - daysBack));
  const year = previous.getUTCFullYear();
  const month = previous.getUTCMonth() + 1;
  const day = previous.getUTCDate();
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    reportDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    start: stockholmMidnightUtc(year, month, day),
    end: stockholmMidnightUtc(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
  };
}

export function previousStockholmDay(now = new Date()) {
  return stockholmDay(now, 1);
}

export function isStockholmDeliveryHour(now = new Date()) {
  return (
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: STOCKHOLM_TIME_ZONE,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    ) === 8
  );
}

function priceSummary(row: PriceSummaryRow | undefined): PriceSummary {
  return {
    count: number(row?.count),
    averagePrice: Math.round(number(row?.averagePrice)),
    minimumPrice: row?.minimumPrice ?? null,
    maximumPrice: row?.maximumPrice ?? null,
  };
}

function ranked(rows: RankedRow[]): Ranked[] {
  return rows.map((row) => ({
    name: row.name?.trim() || "Unknown",
    count: number(row.count),
    averagePrice: Math.round(number(row.averagePrice)),
  }));
}

export async function buildDailyMarketReport(now = new Date(), daysBack = 1): Promise<DailyMarketReport> {
  const { reportDate, start, end } = stockholmDay(now, daysBack);
  const baselineStart = new Date(start.getTime() - 7 * 24 * 60 * 60_000);

  const [
    activeRows,
    newRows,
    soldRows,
    baselineNewRows,
    baselineSoldRows,
    cheapestRows,
    expensiveRows,
    soldVehicleRows,
    modelRows,
    sellerRows,
    newProviderRows,
    activeProviderRows,
    priceChangeRows,
    importRows,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::bigint AS count FROM "ListingRecord" WHERE status = 'active'`,
    ),
    prisma.$queryRawUnsafe<PriceSummaryRow[]>(
      `SELECT COUNT(*)::bigint AS count, AVG("priceAmount") AS "averagePrice", MIN("priceAmount") AS "minimumPrice", MAX("priceAmount") AS "maximumPrice"
       FROM "ListingRecord" WHERE "firstSeenAt" >= $1 AND "firstSeenAt" < $2`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<PriceSummaryRow[]>(
      `SELECT COUNT(DISTINCT "listingId")::bigint AS count, AVG("priceAmount") AS "averagePrice", MIN("priceAmount") AS "minimumPrice", MAX("priceAmount") AS "maximumPrice"
       FROM "ListingObservation" WHERE kind IN ('disappeared', 'verified_missing') AND "observedAt" >= $1 AND "observedAt" < $2`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<AverageRow[]>(
      `SELECT COUNT(*)::numeric / 7 AS average FROM "ListingRecord" WHERE "firstSeenAt" >= $1 AND "firstSeenAt" < $2`,
      baselineStart,
      start,
    ),
    prisma.$queryRawUnsafe<AverageRow[]>(
      `SELECT COUNT(DISTINCT "listingId")::numeric / 7 AS average FROM "ListingObservation" WHERE kind IN ('disappeared', 'verified_missing') AND "observedAt" >= $1 AND "observedAt" < $2`,
      baselineStart,
      start,
    ),
    prisma.$queryRawUnsafe<VehicleRow[]>(
      `SELECT l.id AS "listingId", v.make, v.model, v.variant, v."modelYear", v.drivetrain, v.transmission, v.horsepower, l."mileageKm", o."priceAmount", l."sellerName", o.provider, o."observedAt" AS "disappearedAt"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind IN ('disappeared', 'verified_missing') AND o."observedAt" >= $1 AND o."observedAt" < $2
       ORDER BY o."priceAmount" ASC LIMIT 1`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<VehicleRow[]>(
      `SELECT l.id AS "listingId", v.make, v.model, v.variant, v."modelYear", v.drivetrain, v.transmission, v.horsepower, l."mileageKm", o."priceAmount", l."sellerName", o.provider, o."observedAt" AS "disappearedAt"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind IN ('disappeared', 'verified_missing') AND o."observedAt" >= $1 AND o."observedAt" < $2
       ORDER BY o."priceAmount" DESC LIMIT 1`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<VehicleRow[]>(
      `SELECT DISTINCT ON (o."listingId") l.id AS "listingId", v.make, v.model, v.variant, v."modelYear", v.drivetrain, v.transmission, v.horsepower, l."mileageKm", o."priceAmount", l."sellerName", o.provider, o."observedAt" AS "disappearedAt"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind IN ('disappeared', 'verified_missing') AND o."observedAt" >= $1 AND o."observedAt" < $2
       ORDER BY o."listingId", o."observedAt" DESC LIMIT 500`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<RankedRow[]>(
      `SELECT CONCAT(v.make, ' ', v.model) AS name, COUNT(DISTINCT o."listingId")::bigint AS count, AVG(o."priceAmount") AS "averagePrice"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind IN ('disappeared', 'verified_missing') AND o."observedAt" >= $1 AND o."observedAt" < $2
       GROUP BY v.make, v.model ORDER BY count DESC, name ASC LIMIT 8`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<RankedRow[]>(
      `SELECT COALESCE(NULLIF(TRIM(l."sellerName"), ''), 'Unknown seller') AS name, COUNT(DISTINCT o."listingId")::bigint AS count, AVG(o."priceAmount") AS "averagePrice"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId"
       WHERE o.kind IN ('disappeared', 'verified_missing') AND o."observedAt" >= $1 AND o."observedAt" < $2
       GROUP BY name ORDER BY count DESC, name ASC LIMIT 8`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<RankedRow[]>(
      `SELECT provider AS name, COUNT(*)::bigint AS count, AVG("priceAmount") AS "averagePrice"
       FROM "ListingRecord" WHERE "firstSeenAt" >= $1 AND "firstSeenAt" < $2
       GROUP BY provider ORDER BY count DESC`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<RankedRow[]>(
      `SELECT provider AS name, COUNT(*)::bigint AS count, AVG("priceAmount") AS "averagePrice"
       FROM "ListingRecord" WHERE status = 'active' GROUP BY provider ORDER BY count DESC`,
    ),
    prisma.$queryRawUnsafe<PriceChangeRow[]>(
      `SELECT COUNT(*)::bigint AS count,
        COUNT(*) FILTER (WHERE "priceAmount" < "previousPriceAmount")::bigint AS reductions,
        COUNT(*) FILTER (WHERE "priceAmount" > "previousPriceAmount")::bigint AS increases,
        AVG("priceAmount" - "previousPriceAmount") AS "averageChange"
       FROM "ListingObservation" WHERE kind = 'price_change' AND "observedAt" >= $1 AND "observedAt" < $2`,
      start,
      end,
    ),
    prisma.$queryRawUnsafe<ImportHealthRow[]>(
      `SELECT provider, COUNT(*)::bigint AS runs, SUM("createdCount")::bigint AS "createdCount",
        SUM("updatedCount")::bigint AS "updatedCount", SUM("removedCount")::bigint AS "removedCount",
        SUM("failedCount")::bigint AS "failedCount", COUNT(*) FILTER (WHERE status = 'failed')::bigint AS "failedRuns"
       FROM "ImportRun" WHERE "startedAt" >= $1 AND "startedAt" < $2
       GROUP BY provider ORDER BY provider ASC`,
      start,
      end,
    ),
  ]);

  const priceChanges = priceChangeRows[0];
  return {
    reportDate,
    start,
    end,
    generatedAt: now,
    activeListings: number(activeRows[0]?.count),
    newListings: priceSummary(newRows[0]),
    likelySold: priceSummary(soldRows[0]),
    recentDailyAverageNew: Math.round(number(baselineNewRows[0]?.average)),
    recentDailyAverageLikelySold: Math.round(number(baselineSoldRows[0]?.average)),
    cheapestLikelySold: cheapestRows[0] ?? null,
    mostExpensiveLikelySold: expensiveRows[0] ?? null,
    likelySoldVehicles: soldVehicleRows.sort(
      (left, right) => right.disappearedAt.getTime() - left.disappearedAt.getTime(),
    ),
    topLikelySoldModels: ranked(modelRows),
    topLikelySoldSellers: ranked(sellerRows),
    newListingsByProvider: ranked(newProviderRows),
    activeListingsByProvider: ranked(activeProviderRows),
    priceChanges: {
      count: number(priceChanges?.count),
      reductions: number(priceChanges?.reductions),
      increases: number(priceChanges?.increases),
      averageChange: Math.round(number(priceChanges?.averageChange)),
    },
    importHealth: importRows.map((row) => ({
      provider: row.provider,
      runs: number(row.runs),
      createdCount: number(row.createdCount),
      updatedCount: number(row.updatedCount),
      removedCount: number(row.removedCount),
      failedCount: number(row.failedCount),
      failedRuns: number(row.failedRuns),
    })),
  };
}
