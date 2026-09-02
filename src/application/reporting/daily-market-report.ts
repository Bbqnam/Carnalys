import { plausibleAskingPriceSql } from "@/domain/vehicle/pricing";

const STOCKHOLM_TIME_ZONE = "Europe/Stockholm";

// Every value ever written to ListingObservation.kind. In production this
// column is the Postgres enum "ListingObservationKind"; in a plain checkout it
// is TEXT. A bare string literal compares safely against both, so the report
// only ever uses these literals — never a value outside the set (the crash
// that "verified_missing" caused: 22P02 invalid enum input).
export const OBSERVATION_KINDS = [
  "first_seen",
  "price_change",
  "mileage_change",
  "status_change",
  "disappeared",
  "relisted",
  "seller_change",
  "other_meaningful_change",
] as const;

export interface ReportDatabase {
  // Matches Prisma's own signature: the caller passes the row-array type as T.
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

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
  vehicleId: string;
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
  firstSeenAt: Date | null;
  availabilityCheckStatus: string | null;
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
type VerificationHealthRow = {
  activeTotal: bigint | number;
  neverChecked: bigint | number;
  lastActive: bigint | number;
  lastMissing: bigint | number;
  lastInconclusive: bigint | number;
  oldestCheckAt: Date | null;
  newestCheckAt: Date | null;
};
type DisappearanceMethodRow = {
  directCheck: bigint | number;
  deactivatedSold: bigint | number;
  reconciliation: bigint | number;
};
type ReconciliationRow = { lastCleanupAt: Date | null };
type DatasetAgeRow = { firstSeenAt: Date | null };

export type VerificationStatus =
  | "deactivated_sold" // Blocket page said "sold or removed from the market"
  | "purged" // hard 404 on the ad page / proxy
  | "direct_check_missing" // direct check confirmed gone, kind not distinguished
  | "reconciliation" // never directly checked — inferred from not being re-seen
  | "unknown";

export type VehicleRegisterRow = VehicleRow & {
  verificationStatus: VerificationStatus;
  daysAdvertised: number | null;
};

export type DailyMarketReport = {
  reportDate: string;
  start: Date;
  end: Date;
  generatedAt: Date;
  activeListings: number;
  datasetAgeDays: number | null;
  newListings: PriceSummary;
  likelySold: PriceSummary;
  recentDailyAverageNew: number;
  recentDailyAverageLikelySold: number;
  cheapestLikelySold: VehicleRegisterRow | null;
  mostExpensiveLikelySold: VehicleRegisterRow | null;
  likelySoldVehicles: VehicleRegisterRow[];
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
  verificationHealth: {
    provider: string;
    activeTotal: number;
    neverChecked: number;
    lastActive: number;
    lastMissing: number;
    lastInconclusive: number;
    coveragePercent: number;
    oldestCheckAt: Date | null;
    newestCheckAt: Date | null;
  };
  lastReconciliationCleanupAt: Date | null;
  disappearanceMethod: { directCheck: number; deactivatedSold: number; reconciliation: number };
  warnings: string[];
  observations: string[];
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

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

// `availabilityCheckStatus` is written as `active` / `inconclusive` / `missing`,
// or `missing:deactivated` / `missing:purged` / `missing:unknown` when the poll
// distinguished how the ad was gone.
function verificationStatusOf(status: string | null): VerificationStatus {
  if (!status) return "reconciliation";
  if (status.startsWith("missing:deactivated")) return "deactivated_sold";
  if (status.startsWith("missing:purged")) return "purged";
  if (status === "missing" || status.startsWith("missing")) return "direct_check_missing";
  if (status === "active" || status === "inconclusive") return "reconciliation";
  return "unknown";
}

function normalizeVehicle(row: VehicleRow | undefined): VehicleRegisterRow | null {
  if (!row) return null;
  const disappearedAt = toDate(row.disappearedAt) ?? new Date(0);
  const firstSeenAt = toDate(row.firstSeenAt);
  const daysAdvertised = firstSeenAt
    ? Math.max(0, Math.round((disappearedAt.getTime() - firstSeenAt.getTime()) / 86_400_000))
    : null;
  return {
    ...row,
    disappearedAt,
    firstSeenAt,
    daysAdvertised,
    verificationStatus: verificationStatusOf(row.availabilityCheckStatus),
  };
}

const VEHICLE_COLUMNS = `l.id AS "listingId", l."vehicleId", v.make, v.model, v.variant, v."modelYear",
  v.drivetrain, v.transmission, v.horsepower, l."mileageKm", o."priceAmount", l."sellerName",
  o.provider, o."observedAt" AS "disappearedAt", l."firstSeenAt", l."availabilityCheckStatus"`;

export async function buildDailyMarketReport(
  now = new Date(),
  daysBack = 1,
  database?: ReportDatabase,
): Promise<DailyMarketReport> {
  const db = database ?? (await loadDefaultDatabase());
  const { reportDate, start, end } = stockholmDay(now, daysBack);
  const baselineStart = new Date(start.getTime() - 7 * 24 * 60 * 60_000);

  // ~5% of ads advertise a monthly rate, deposit or 1 kr placeholder instead of
  // the car's price. They still count as listings that appeared/disappeared,
  // but they must not pollute the money figures (averages, cheapest/priciest).
  const currentYear = now.getUTCFullYear();
  const plausibleObs = plausibleAskingPriceSql('o."priceAmount"', 'v."modelYear"', currentYear);
  const plausibleNew = plausibleAskingPriceSql('l."priceAmount"', 'v."modelYear"', currentYear);

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
    verificationRows,
    disappearanceMethodRows,
    reconciliationRows,
    datasetAgeRows,
  ] = await Promise.all([
    db.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::bigint AS count FROM "ListingRecord" WHERE status = 'active'`,
    ),
    db.$queryRawUnsafe<PriceSummaryRow[]>(
      `SELECT COUNT(*)::bigint AS count,
         AVG(l."priceAmount") FILTER (WHERE ${plausibleNew}) AS "averagePrice",
         MIN(l."priceAmount") FILTER (WHERE ${plausibleNew}) AS "minimumPrice",
         MAX(l."priceAmount") FILTER (WHERE ${plausibleNew}) AS "maximumPrice"
       FROM "ListingRecord" l JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE l."firstSeenAt" >= $1 AND l."firstSeenAt" < $2`,
      start,
      end,
    ),
    db.$queryRawUnsafe<PriceSummaryRow[]>(
      `SELECT COUNT(DISTINCT o."listingId")::bigint AS count,
         AVG(o."priceAmount") FILTER (WHERE ${plausibleObs}) AS "averagePrice",
         MIN(o."priceAmount") FILTER (WHERE ${plausibleObs}) AS "minimumPrice",
         MAX(o."priceAmount") FILTER (WHERE ${plausibleObs}) AS "maximumPrice"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2`,
      start,
      end,
    ),
    db.$queryRawUnsafe<AverageRow[]>(
      `SELECT COUNT(*)::numeric / 7 AS average FROM "ListingRecord" WHERE "firstSeenAt" >= $1 AND "firstSeenAt" < $2`,
      baselineStart,
      start,
    ),
    db.$queryRawUnsafe<AverageRow[]>(
      `SELECT COUNT(DISTINCT "listingId")::numeric / 7 AS average FROM "ListingObservation" WHERE kind = 'disappeared' AND "observedAt" >= $1 AND "observedAt" < $2`,
      baselineStart,
      start,
    ),
    db.$queryRawUnsafe<VehicleRow[]>(
      `SELECT ${VEHICLE_COLUMNS}
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2 AND ${plausibleObs}
       ORDER BY o."priceAmount" ASC LIMIT 1`,
      start,
      end,
    ),
    db.$queryRawUnsafe<VehicleRow[]>(
      `SELECT ${VEHICLE_COLUMNS}
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2 AND ${plausibleObs}
       ORDER BY o."priceAmount" DESC LIMIT 1`,
      start,
      end,
    ),
    db.$queryRawUnsafe<VehicleRow[]>(
      `SELECT DISTINCT ON (o."listingId") ${VEHICLE_COLUMNS}
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2
       ORDER BY o."listingId", o."observedAt" DESC LIMIT 500`,
      start,
      end,
    ),
    db.$queryRawUnsafe<RankedRow[]>(
      `SELECT CONCAT(v.make, ' ', v.model) AS name, COUNT(DISTINCT o."listingId")::bigint AS count,
         AVG(o."priceAmount") FILTER (WHERE ${plausibleObs}) AS "averagePrice"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2
       GROUP BY v.make, v.model ORDER BY count DESC, name ASC LIMIT 8`,
      start,
      end,
    ),
    db.$queryRawUnsafe<RankedRow[]>(
      `SELECT COALESCE(NULLIF(TRIM(l."sellerName"), ''), 'Unknown seller') AS name, COUNT(DISTINCT o."listingId")::bigint AS count,
         AVG(o."priceAmount") FILTER (WHERE ${plausibleObs}) AS "averagePrice"
       FROM "ListingObservation" o JOIN "ListingRecord" l ON l.id = o."listingId" JOIN "VehicleRecord" v ON v.id = l."vehicleId"
       WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2
       GROUP BY name ORDER BY count DESC, name ASC LIMIT 8`,
      start,
      end,
    ),
    db.$queryRawUnsafe<RankedRow[]>(
      `SELECT provider AS name, COUNT(*)::bigint AS count, AVG("priceAmount") AS "averagePrice"
       FROM "ListingRecord" WHERE "firstSeenAt" >= $1 AND "firstSeenAt" < $2
       GROUP BY provider ORDER BY count DESC`,
      start,
      end,
    ),
    db.$queryRawUnsafe<RankedRow[]>(
      `SELECT provider AS name, COUNT(*)::bigint AS count, AVG("priceAmount") AS "averagePrice"
       FROM "ListingRecord" WHERE status = 'active' GROUP BY provider ORDER BY count DESC`,
    ),
    db.$queryRawUnsafe<PriceChangeRow[]>(
      `SELECT COUNT(*)::bigint AS count,
        COUNT(*) FILTER (WHERE "priceAmount" < "previousPriceAmount")::bigint AS reductions,
        COUNT(*) FILTER (WHERE "priceAmount" > "previousPriceAmount")::bigint AS increases,
        AVG("priceAmount" - "previousPriceAmount") AS "averageChange"
       FROM "ListingObservation" WHERE kind = 'price_change' AND "observedAt" >= $1 AND "observedAt" < $2`,
      start,
      end,
    ),
    db.$queryRawUnsafe<ImportHealthRow[]>(
      `SELECT provider, COUNT(*)::bigint AS runs, SUM("createdCount")::bigint AS "createdCount",
        SUM("updatedCount")::bigint AS "updatedCount", SUM("removedCount")::bigint AS "removedCount",
        SUM("failedCount")::bigint AS "failedCount", COUNT(*) FILTER (WHERE status = 'failed')::bigint AS "failedRuns"
       FROM "ImportRun" WHERE "startedAt" >= $1 AND "startedAt" < $2
       GROUP BY provider ORDER BY provider ASC`,
      start,
      end,
    ),
    db.$queryRawUnsafe<VerificationHealthRow[]>(
      `SELECT
        COUNT(*)::bigint AS "activeTotal",
        COUNT(*) FILTER (WHERE "availabilityCheckedAt" IS NULL)::bigint AS "neverChecked",
        COUNT(*) FILTER (WHERE "availabilityCheckStatus" = 'active')::bigint AS "lastActive",
        COUNT(*) FILTER (WHERE "availabilityCheckStatus" = 'missing')::bigint AS "lastMissing",
        COUNT(*) FILTER (WHERE "availabilityCheckStatus" = 'inconclusive')::bigint AS "lastInconclusive",
        MIN("availabilityCheckedAt") AS "oldestCheckAt",
        MAX("availabilityCheckedAt") AS "newestCheckAt"
       FROM "ListingRecord" WHERE provider = 'blocket_unofficial' AND status = 'active'`,
    ),
    db.$queryRawUnsafe<DisappearanceMethodRow[]>(
      `SELECT
        COUNT(*) FILTER (WHERE l."availabilityCheckStatus" LIKE 'missing%')::bigint AS "directCheck",
        COUNT(*) FILTER (WHERE l."availabilityCheckStatus" LIKE 'missing:deactivated%')::bigint AS "deactivatedSold",
        COUNT(*) FILTER (WHERE l."availabilityCheckStatus" IS NULL OR l."availabilityCheckStatus" NOT LIKE 'missing%')::bigint AS "reconciliation"
       FROM (
         SELECT DISTINCT o."listingId" FROM "ListingObservation" o
         WHERE o.kind = 'disappeared' AND o."observedAt" >= $1 AND o."observedAt" < $2
       ) d JOIN "ListingRecord" l ON l.id = d."listingId"`,
      start,
      end,
    ),
    db.$queryRawUnsafe<ReconciliationRow[]>(
      `SELECT MAX("cleanupAppliedAt") AS "lastCleanupAt" FROM "ImportRun"
       WHERE mode = 'reconciliation' AND "cleanupAppliedAt" IS NOT NULL`,
    ),
    db.$queryRawUnsafe<DatasetAgeRow[]>(
      `SELECT MIN("firstSeenAt") AS "firstSeenAt" FROM "ListingRecord"
       WHERE provider = 'blocket_unofficial' AND status = 'active'`,
    ),
  ]);

  const priceChanges = priceChangeRows[0];
  const likelySold = priceSummary(soldRows[0]);
  const newListings = priceSummary(newRows[0]);
  const activeListings = number(activeRows[0]?.count);
  const importHealth = importRows.map((row) => ({
    provider: row.provider,
    runs: number(row.runs),
    createdCount: number(row.createdCount),
    updatedCount: number(row.updatedCount),
    removedCount: number(row.removedCount),
    failedCount: number(row.failedCount),
    failedRuns: number(row.failedRuns),
  }));

  const verificationRow = verificationRows[0];
  const verificationActiveTotal = number(verificationRow?.activeTotal);
  const verificationNeverChecked = number(verificationRow?.neverChecked);
  const verificationHealth = {
    provider: "blocket_unofficial",
    activeTotal: verificationActiveTotal,
    neverChecked: verificationNeverChecked,
    lastActive: number(verificationRow?.lastActive),
    lastMissing: number(verificationRow?.lastMissing),
    lastInconclusive: number(verificationRow?.lastInconclusive),
    coveragePercent: verificationActiveTotal
      ? Math.round(((verificationActiveTotal - verificationNeverChecked) / verificationActiveTotal) * 100)
      : 0,
    oldestCheckAt: toDate(verificationRow?.oldestCheckAt),
    newestCheckAt: toDate(verificationRow?.newestCheckAt),
  };

  const disappearanceMethod = {
    directCheck: number(disappearanceMethodRows[0]?.directCheck),
    deactivatedSold: number(disappearanceMethodRows[0]?.deactivatedSold),
    reconciliation: number(disappearanceMethodRows[0]?.reconciliation),
  };
  const lastReconciliationCleanupAt = toDate(reconciliationRows[0]?.lastCleanupAt);
  const datasetFirstSeen = toDate(datasetAgeRows[0]?.firstSeenAt);
  const datasetAgeDays = datasetFirstSeen
    ? Math.max(0, Math.round((now.getTime() - datasetFirstSeen.getTime()) / 86_400_000))
    : null;

  const likelySoldVehicles = soldVehicleRows
    .map((row) => normalizeVehicle(row)!)
    .sort((left, right) => right.disappearedAt.getTime() - left.disappearedAt.getTime());
  const topLikelySoldModels = ranked(modelRows);
  const topLikelySoldSellers = ranked(sellerRows);

  const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
  const warnings: string[] = [];
  if (likelySold.count === 0) {
    warnings.push(
      "No disappearances were recorded for this period. This is only credible if the availability sample and reconciliation actually ran — check the verification health and sample age below before treating it as a real market signal.",
    );
  }
  if (verificationHealth.activeTotal > 0 && verificationHealth.coveragePercent < 50) {
    warnings.push(
      `Only ${verificationHealth.coveragePercent}% of active Blocket inventory (${integer.format(verificationHealth.activeTotal - verificationHealth.neverChecked)} of ${integer.format(verificationHealth.activeTotal)}) has ever had a direct availability check.`,
    );
  }
  if (!lastReconciliationCleanupAt || now.getTime() - lastReconciliationCleanupAt.getTime() > 7 * 86_400_000) {
    warnings.push(
      "No full Blocket reconciliation pass has completed a removal sweep in the last 7 days, so disappearance detection currently depends almost entirely on the direct availability sample.",
    );
  }
  if (datasetAgeDays != null && datasetAgeDays < 21) {
    warnings.push(
      `The Blocket dataset is only ${datasetAgeDays} days old; cumulative disappearance counts are still ramping up and daily figures will understate the true rate.`,
    );
  }
  if (
    verificationHealth.lastInconclusive > 20 &&
    verificationHealth.lastInconclusive >= verificationHealth.lastMissing
  ) {
    warnings.push(
      `The most recent availability sample returned ${integer.format(verificationHealth.lastInconclusive)} inconclusive results; the checker service may be degraded or rate-limiting.`,
    );
  }
  for (const health of importHealth) {
    if (health.failedRuns > 0) {
      warnings.push(`${health.provider} had ${health.failedRuns} failed import run(s) in this period.`);
    }
  }

  const observations: string[] = [];
  if (topLikelySoldSellers[0] && topLikelySoldSellers[0].count >= 3) {
    observations.push(
      `${topLikelySoldSellers[0].name} accounts for ${topLikelySoldSellers[0].count} disappeared listings — check whether this is genuine turnover or a bulk delisting.`,
    );
  }
  if (topLikelySoldModels[0] && topLikelySoldModels[0].count >= 3) {
    observations.push(
      `${topLikelySoldModels[0].name} leads disappearances with ${topLikelySoldModels[0].count}; worth watching for unusual demand.`,
    );
  }
  const changeCount = number(priceChanges?.count);
  const reductions = number(priceChanges?.reductions);
  const increases = number(priceChanges?.increases);
  if (changeCount >= 10 && reductions > increases * 3) {
    observations.push(
      `Asking prices moved down broadly today: ${integer.format(reductions)} cuts versus ${integer.format(increases)} increases.`,
    );
  }
  const cheapest = normalizeVehicle(cheapestRows[0]);
  if (cheapest && cheapest.priceAmount > 0 && cheapest.priceAmount < 20_000) {
    observations.push(
      `Cheapest likely-sold listing is ${integer.format(cheapest.priceAmount)} kr — verify it is a real asking price and not a deposit or placeholder.`,
    );
  }

  return {
    reportDate,
    start,
    end,
    generatedAt: now,
    activeListings,
    datasetAgeDays,
    newListings,
    likelySold,
    recentDailyAverageNew: Math.round(number(baselineNewRows[0]?.average)),
    recentDailyAverageLikelySold: Math.round(number(baselineSoldRows[0]?.average)),
    cheapestLikelySold: cheapest,
    mostExpensiveLikelySold: normalizeVehicle(expensiveRows[0]),
    likelySoldVehicles,
    topLikelySoldModels,
    topLikelySoldSellers,
    newListingsByProvider: ranked(newProviderRows),
    activeListingsByProvider: ranked(activeProviderRows),
    priceChanges: {
      count: changeCount,
      reductions,
      increases,
      averageChange: Math.round(number(priceChanges?.averageChange)),
    },
    importHealth,
    verificationHealth,
    lastReconciliationCleanupAt,
    disappearanceMethod,
    warnings,
    observations,
  };
}

// Loaded lazily so this module can be imported (and unit-tested with an
// injected database) without a configured DATABASE_URL.
async function loadDefaultDatabase(): Promise<ReportDatabase> {
  const { prisma } = await import("@/infrastructure/database/prisma");
  return prisma as unknown as ReportDatabase;
}
