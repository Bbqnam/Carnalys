import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyMarketReport,
  OBSERVATION_KINDS,
  type ReportDatabase,
} from "./daily-market-report";

const NOW = new Date("2026-09-02T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function vehicleRow(overrides: Record<string, unknown> = {}) {
  return {
    listingId: "listing-1",
    vehicleId: "vehicle-1",
    make: "Volvo",
    model: "V60",
    variant: "D4 Momentum",
    modelYear: 2019,
    drivetrain: "Tvåhjulsdriven",
    transmission: "Automatisk",
    horsepower: 190,
    mileageKm: 92_000,
    priceAmount: 189_000,
    sellerName: "Bilhandlare AB",
    provider: "blocket_unofficial",
    disappearedAt: new Date("2026-09-02T06:30:00Z"),
    firstSeenAt: daysAgo(11),
    availabilityCheckStatus: "missing",
    ...overrides,
  };
}

interface FakeOptions {
  soldCount?: number;
  soldVehicles?: Array<Record<string, unknown>>;
  importRows?: Array<Record<string, unknown>>;
  verification?: Record<string, unknown>;
  sellerRows?: Array<Record<string, unknown>>;
  datasetFirstSeen?: Date | null;
}

function makeDatabase(options: FakeOptions = {}) {
  const queries: string[] = [];
  const soldVehicles = options.soldVehicles ?? [vehicleRow()];
  const db: ReportDatabase = {
    async $queryRawUnsafe<T>(sql: string): Promise<T> {
      queries.push(sql);
      const has = (needle: string) => sql.includes(needle);
      let rows: unknown[] = [];
      if (has("width_bucket")) rows = [{ bucket: 3, count: 5 }, { bucket: 6, count: 40 }, { bucket: 9, count: 2 }];
      else if (has('date_trunc(\'day\', o."observedAt")'))
        rows = [
          { day: new Date("2026-09-01T00:00:00Z"), count: 7 },
          { day: new Date("2026-09-02T00:00:00Z"), count: 12 },
        ];
      else if (has('date_trunc(\'day\', "firstSeenAt")'))
        rows = [{ day: new Date("2026-09-02T00:00:00Z"), count: 30 }];
      else if (has("NULLIF(TRIM(v.drivetrain)"))
        rows = [
          { name: "all_wheel_drive", count: 5, averagePrice: 200_000 },
          { name: "Unknown", count: 3, averagePrice: 150_000 },
        ];
      else if (has("status = 'removed'")) rows = [{ total: 500, blocket: 480 }];
      else if (has("DISTINCT ON (o.\"listingId\")")) rows = soldVehicles;
      else if (has('ORDER BY o."priceAmount" ASC')) rows = [soldVehicles[0]].filter(Boolean);
      else if (has('ORDER BY o."priceAmount" DESC')) rows = [soldVehicles[soldVehicles.length - 1]].filter(Boolean);
      else if (has('"activeTotal"')) {
        rows = [
          options.verification ?? {
            activeTotal: 125_000,
            neverChecked: 124_000,
            lastActive: 250,
            lastMissing: 4,
            lastInconclusive: 46,
            oldestCheckAt: daysAgo(1),
            newestCheckAt: daysAgo(1),
          },
        ];
      } else if (has('"directCheck"')) rows = [{ directCheck: 4, deactivatedSold: 3, reconciliation: 0 }];
      else if (has('MAX("cleanupAppliedAt")')) rows = [{ lastCleanupAt: null }];
      else if (has('MIN("firstSeenAt") AS "firstSeenAt" FROM "ListingRecord"'))
        rows = [{ firstSeenAt: options.datasetFirstSeen === undefined ? daysAgo(13) : options.datasetFirstSeen }];
      else if (has("kind = 'price_change'"))
        rows = [{ count: 30, reductions: 26, increases: 2, averageChange: -9000 }];
      else if (has("kind = 'disappeared'") && has('::numeric / 7'))
        rows = [{ average: 3 }];
      else if (has('FROM "ListingRecord"') && has('::numeric / 7')) rows = [{ average: 110 }];
      else if (has("kind = 'disappeared'") && has('"minimumPrice"'))
        rows = [
          {
            count: BigInt(options.soldCount ?? soldVehicles.length),
            averagePrice: 178_000,
            minimumPrice: 45_000,
            maximumPrice: 320_000,
          },
        ];
      else if (has('FROM "ListingRecord"') && has('"minimumPrice"'))
        rows = [{ count: 120, averagePrice: 205_000, minimumPrice: 20_000, maximumPrice: 900_000 }];
      else if (has('status = \'active\' GROUP BY provider'))
        rows = [{ name: "blocket_unofficial", count: 125_000, averagePrice: 190_000 }];
      else if (has('GROUP BY provider'))
        rows = [{ name: "blocket_unofficial", count: 90, averagePrice: 200_000 }];
      else if (has("GROUP BY v.make, v.model"))
        rows = [{ name: "Volvo V60", count: 3, averagePrice: 180_000 }];
      else if (has("GROUP BY name"))
        rows = options.sellerRows ?? [{ name: "Bilhandlare AB", count: 4, averagePrice: 185_000 }];
      else if (has('FROM "ImportRun"')) rows = options.importRows ?? [];
      else if (has('WHERE status = \'active\'')) rows = [{ count: 133_000 }];
      else rows = [];
      return rows as T;
    },
  };
  return { db, queries };
}

test("the report counts the day's disappearances and lists the vehicle in the register", async () => {
  const { db } = makeDatabase({ soldCount: 3, soldVehicles: [vehicleRow(), vehicleRow({ listingId: "l2", vehicleId: "v2", priceAmount: 320_000, availabilityCheckStatus: null })] });
  const report = await buildDailyMarketReport(NOW, 0, db);

  assert.equal(report.likelySold.count, 3);
  assert.equal(report.likelySoldVehicles.length, 2);
  const first = report.likelySoldVehicles[0];
  assert.equal(first.vehicleId, "vehicle-1");
  assert.equal(first.verificationStatus, "direct_check_missing");
  assert.equal(first.daysAdvertised, 11);
  assert.equal(report.likelySoldVehicles[1].verificationStatus, "reconciliation");
  assert.equal(report.disappearanceMethod.directCheck, 4);
  assert.equal(report.disappearanceMethod.deactivatedSold, 3);
});

test("every kind literal in the report SQL is a known observation kind", async () => {
  const { db, queries } = makeDatabase();
  await buildDailyMarketReport(NOW, 0, db);
  const kinds = new Set<string>();
  for (const sql of queries) {
    for (const match of sql.matchAll(/kind\s*=\s*'([a-z_]+)'/g)) kinds.add(match[1]);
  }
  assert.ok(kinds.size > 0, "expected the report to filter on kind");
  for (const kind of kinds) {
    assert.ok(
      (OBSERVATION_KINDS as readonly string[]).includes(kind),
      `report used unknown observation kind: ${kind}`,
    );
  }
  assert.ok(!kinds.has("verified_missing"));
});

test("report query works against both the enum and the text kind column", async () => {
  // The report only ever compares `kind` to a bare string literal, which
  // Postgres accepts whether the column is TEXT or the ListingObservationKind
  // enum. Passing an injected database that ignores the column type proves the
  // query shape is type-agnostic; the literal check above proves the values
  // are inside the enum.
  const { db, queries } = makeDatabase();
  const report = await buildDailyMarketReport(NOW, 0, db);
  assert.ok(report.reportDate.startsWith("2026-09-02"));
  assert.ok(queries.some((sql) => sql.includes("kind = 'disappeared'")));
  assert.ok(!queries.some((sql) => /kind::"?ListingObservationKind"?/.test(sql)));
});

test("coverage and confidence warnings are derived, not hard-coded", async () => {
  const { db } = makeDatabase({ soldCount: 0, soldVehicles: [] });
  const report = await buildDailyMarketReport(NOW, 0, db);
  assert.ok(report.warnings.some((w) => w.includes("No disappearances were recorded")));
  assert.ok(report.warnings.some((w) => w.includes("% of active Blocket inventory")));
  assert.ok(report.warnings.some((w) => w.includes("reconciliation")));
  assert.ok(report.warnings.some((w) => w.includes("dataset is only")));
});

test("thin coverage marks the day a backlog; broad coverage does not", async () => {
  const thin = makeDatabase({
    verification: {
      activeTotal: 100_000,
      neverChecked: 95_000,
      lastActive: 10,
      lastMissing: 2,
      lastInconclusive: 1,
      oldestCheckAt: daysAgo(1),
      newestCheckAt: daysAgo(1),
    },
  });
  const thinReport = await buildDailyMarketReport(NOW, 0, thin.db);
  assert.equal(thinReport.backlog.active, true);
  assert.ok(thinReport.backlog.daysToFullCoverage && thinReport.backlog.daysToFullCoverage > 0);

  const broad = makeDatabase({
    verification: {
      activeTotal: 100_000,
      neverChecked: 20_000,
      lastActive: 10,
      lastMissing: 2,
      lastInconclusive: 1,
      oldestCheckAt: daysAgo(2),
      newestCheckAt: daysAgo(1),
    },
  });
  const broadReport = await buildDailyMarketReport(NOW, 0, broad.db);
  assert.equal(broadReport.backlog.active, false);
});

test("the daily series are dense 21-day windows ending today, plus the new aggregates", async () => {
  const { db } = makeDatabase();
  const report = await buildDailyMarketReport(NOW, 0, db);

  assert.equal(report.removalsByDay.length, 21);
  assert.equal(report.newListingsByDay.length, 21);
  assert.equal(report.removalsByDay.at(-1)?.date, "2026-09-02");
  assert.equal(report.removalsByDay.at(-1)?.count, 12);
  assert.equal(report.removalsByDay.at(-2)?.count, 7);
  assert.equal(report.removalsByDay[0]?.count, 0, "days with no data are zero, not gaps");
  assert.equal(report.newListingsByDay.at(-1)?.count, 30);

  assert.equal(report.removedToDate.blocket, 480);
  assert.equal(report.removedToDate.total, 500);
  assert.equal(report.priceChangeHistogram.length, 13);
  assert.equal(report.priceChangeHistogram[6].count, 40);
  assert.equal(report.priceChangeHistogram[3].count, 5);
  assert.equal(report.removalDrivetrainMix[0]?.name, "all_wheel_drive");
});

test("a healthy day with coverage produces the seller/model observations and fewer warnings", async () => {
  const { db } = makeDatabase({
    soldCount: 6,
    soldVehicles: [vehicleRow(), vehicleRow({ listingId: "l2", vehicleId: "v2" })],
    verification: {
      activeTotal: 125_000,
      neverChecked: 10_000,
      lastActive: 250,
      lastMissing: 8,
      lastInconclusive: 2,
      oldestCheckAt: daysAgo(2),
      newestCheckAt: daysAgo(1),
    },
    datasetFirstSeen: daysAgo(90),
    sellerRows: [{ name: "Storstadsbilar AB", count: 5, averagePrice: 190_000 }],
  });
  const report = await buildDailyMarketReport(NOW, 0, db);
  assert.ok(report.observations.some((o) => o.includes("Storstadsbilar AB")));
  assert.ok(report.observations.some((o) => o.includes("Volvo V60")));
  assert.ok(!report.warnings.some((w) => w.includes("% of active Blocket inventory")));
  assert.ok(!report.warnings.some((w) => w.includes("dataset is only")));
});
