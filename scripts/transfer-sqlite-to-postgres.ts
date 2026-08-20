import "dotenv/config";

import path from "node:path";
import Database from "better-sqlite3";
import { Pool } from "pg";

import { refreshCatalogFacets } from "@/infrastructure/database/catalog-facet-repository";

type Mode = "slim" | "full";

interface TransferOptions {
  mode: Mode;
  maxListings?: number;
  imagesPerListing: number;
  batchSize: number;
  dryRun: boolean;
  sqlitePath: string;
}

const TABLES_IN_DEPENDENCY_ORDER = [
  "VehicleRecord",
  "ListingRecord",
  "ListingAnalysisRecord",
  "ListingImageRecord",
  "ListingEquipmentRecord",
  "ImportRun",
  "ImportCheckpoint",
  "ImportRunError",
  "SynchronizationLock",
  "CatalogMakeFacet",
  "CatalogModelFacet",
  "CatalogYearFacet",
  "CatalogSummary",
] as const;

function parseArgs(argv: string[]): TransferOptions {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value ?? "true");
  }

  const mode = args.get("mode");
  if (mode !== "slim" && mode !== "full") {
    throw new Error(
      'Pass --mode=slim or --mode=full. Slim mode drops rawPayload and caps images per listing (default 1); full mode mirrors SQLite exactly.',
    );
  }

  const maxListingsRaw = args.get("max-listings");
  const maxListings = maxListingsRaw ? Number.parseInt(maxListingsRaw, 10) : undefined;
  if (maxListingsRaw !== undefined && (!Number.isInteger(maxListings) || (maxListings as number) <= 0)) {
    throw new Error("--max-listings must be a positive integer.");
  }

  const imagesPerListingRaw = args.get("images-per-listing");
  const imagesPerListing = imagesPerListingRaw
    ? Number.parseInt(imagesPerListingRaw, 10)
    : mode === "slim"
      ? 1
      : Number.POSITIVE_INFINITY;

  const batchSizeRaw = args.get("batch-size");
  const batchSize = batchSizeRaw ? Number.parseInt(batchSizeRaw, 10) : 500;

  return {
    mode,
    maxListings,
    imagesPerListing,
    batchSize,
    dryRun: args.has("dry-run"),
    sqlitePath: args.get("sqlite-path") ?? path.resolve(process.cwd(), "prisma/dev.db"),
  };
}

function countAll(sqlite: Database.Database, table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

function selectListingIds(sqlite: Database.Database, options: TransferOptions): Set<string> {
  const stmt = options.maxListings
    ? sqlite.prepare(`SELECT id FROM ListingRecord ORDER BY publishedAt DESC, id DESC LIMIT ?`)
    : sqlite.prepare(`SELECT id FROM ListingRecord`);
  const rows = (options.maxListings ? stmt.all(options.maxListings) : stmt.all()) as {
    id: string;
  }[];
  return new Set(rows.map((row) => row.id));
}

function selectVehicleIds(sqlite: Database.Database, listingIds: Set<string>): Set<string> {
  const vehicleIds = new Set<string>();
  const stmt = sqlite.prepare(`SELECT id, vehicleId FROM ListingRecord`);
  for (const row of stmt.iterate() as IterableIterator<{ id: string; vehicleId: string }>) {
    if (listingIds.has(row.id)) vehicleIds.add(row.vehicleId);
  }
  return vehicleIds;
}

async function assertTargetIsEmpty(pg: Pool) {
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    const result = await pg.query(`SELECT COUNT(*)::text AS count FROM "${table}"`);
    const count = Number.parseInt(result.rows[0].count, 10);
    if (count > 0) {
      throw new Error(
        `Target table "${table}" already has ${count} row(s). Refusing to import into a non-empty database.`,
      );
    }
  }
}

async function bulkInsert(pg: Pool, table: string, columns: string[], rows: unknown[][]) {
  if (rows.length === 0) return;
  const columnList = columns.map((column) => `"${column}"`).join(", ");
  const valuePlaceholders = rows
    .map((row, rowIndex) => {
      const offset = rowIndex * columns.length;
      return `(${row.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
    })
    .join(", ");
  await pg.query(`INSERT INTO "${table}" (${columnList}) VALUES ${valuePlaceholders}`, rows.flat());
}

async function resetSequence(pg: Pool, table: string, column: string) {
  const maxResult = await pg.query(`SELECT MAX("${column}") AS max FROM "${table}"`);
  const max = maxResult.rows[0].max as number | null;
  await pg.query(`SELECT setval(pg_get_serial_sequence($1, $2), $3, $4)`, [
    `"${table}"`,
    column,
    max ?? 1,
    max !== null,
  ]);
  console.log(`Sequence for "${table}"."${column}" reset to ${max ?? "1 (unused)"}.`);
}

const VEHICLE_COLUMNS = [
  "id",
  "vin",
  "registrationNumber",
  "make",
  "model",
  "variant",
  "modelYear",
  "registrationYear",
  "bodyStyle",
  "fuelType",
  "transmission",
  "drivetrain",
  "horsepower",
  "engineDescription",
  "engineDisplacement",
  "firstRegistration",
  "createdAt",
  "updatedAt",
];

async function transferVehicles(sqlite: Database.Database, pg: Pool, vehicleIds: Set<string>, batchSize: number) {
  const stmt = sqlite.prepare(`SELECT ${VEHICLE_COLUMNS.join(", ")} FROM VehicleRecord`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    if (!vehicleIds.has(row.id as string)) continue;
    batch.push(VEHICLE_COLUMNS.map((column) => row[column]));
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "VehicleRecord", VEHICLE_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "VehicleRecord", VEHICLE_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`VehicleRecord: imported ${total}`);
}

const LISTING_COLUMNS = [
  "id",
  "provider",
  "sourceScope",
  "externalId",
  "vehicleId",
  "listingUrl",
  "sellerName",
  "sellerType",
  "priceAmount",
  "previousPriceAmount",
  "monthlyCostAmount",
  "currency",
  "mileageKm",
  "location",
  "municipality",
  "latitude",
  "longitude",
  "description",
  "serviceHistory",
  "status",
  "publishedAt",
  "sourceUpdatedAt",
  "firstSeenAt",
  "lastSeenAt",
  "synchronizedAt",
  "removedAt",
  "rawPayload",
  "contentHash",
  "imageHash",
  "equipmentHash",
  "missingReconciliationCount",
];

const POSTGRES_INT_MAX = 2147483647;
const LISTING_INT_COLUMNS = ["priceAmount", "previousPriceAmount", "monthlyCostAmount", "mileageKm"];

function findOutOfRangeIntColumn(row: Record<string, unknown>): string | undefined {
  return LISTING_INT_COLUMNS.find((column) => {
    const value = row[column];
    return typeof value === "number" && Math.abs(value) > POSTGRES_INT_MAX;
  });
}

async function transferListings(
  sqlite: Database.Database,
  pg: Pool,
  listingIds: Set<string>,
  options: TransferOptions,
) {
  const stmt = sqlite.prepare(`SELECT ${LISTING_COLUMNS.join(", ")} FROM ListingRecord`);
  let batch: unknown[][] = [];
  let total = 0;
  const rejected: { id: string; column: string; value: unknown }[] = [];
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    const id = row.id as string;
    if (!listingIds.has(id)) continue;
    const badColumn = findOutOfRangeIntColumn(row);
    if (badColumn) {
      rejected.push({ id, column: badColumn, value: row[badColumn] });
      listingIds.delete(id);
      continue;
    }
    const values = LISTING_COLUMNS.map((column) =>
      column === "rawPayload" && options.mode === "slim" ? null : row[column],
    );
    batch.push(values);
    if (batch.length >= options.batchSize) {
      await bulkInsert(pg, "ListingRecord", LISTING_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ListingRecord", LISTING_COLUMNS, batch);
    total += batch.length;
  }
  console.log(
    `ListingRecord: imported ${total}${options.mode === "slim" ? " (rawPayload dropped)" : ""}`,
  );
  if (rejected.length > 0) {
    console.warn(
      `ListingRecord: skipped ${rejected.length} listing(s) with a value outside PostgreSQL's 32-bit integer range (source data quality issue, not caused by this transfer):`,
    );
    for (const item of rejected) {
      console.warn(`  ${item.id}: ${item.column} = ${item.value}`);
    }
  }
}

const ANALYSIS_COLUMNS = [
  "listingId",
  "marketValueAmount",
  "marketValueMinimum",
  "marketValueMaximum",
  "comparableCount",
  "confidence",
  "dealScore",
  "buyConfidenceScore",
  "annualOwnershipCost",
  "methodologyVersion",
  "calculatedAt",
  "sourceSynchronizedAt",
];

async function transferAnalyses(
  sqlite: Database.Database,
  pg: Pool,
  listingIds: Set<string>,
  batchSize: number,
) {
  const stmt = sqlite.prepare(`SELECT ${ANALYSIS_COLUMNS.join(", ")} FROM ListingAnalysisRecord`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    if (!listingIds.has(row.listingId as string)) continue;
    batch.push(ANALYSIS_COLUMNS.map((column) => row[column]));
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "ListingAnalysisRecord", ANALYSIS_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ListingAnalysisRecord", ANALYSIS_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`ListingAnalysisRecord: imported ${total}`);
}

const IMAGE_COLUMNS = ["id", "listingId", "url", "thumbnailUrl", "alt", "position", "width", "height"];

async function transferImages(
  sqlite: Database.Database,
  pg: Pool,
  listingIds: Set<string>,
  options: TransferOptions,
) {
  const stmt = sqlite.prepare(
    `SELECT ${IMAGE_COLUMNS.join(", ")} FROM ListingImageRecord ORDER BY listingId, position ASC`,
  );
  const perListingCount = new Map<string, number>();
  let batch: unknown[][] = [];
  let total = 0;
  let skippedForCap = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    const listingId = row.listingId as string;
    if (!listingIds.has(listingId)) continue;
    const seen = perListingCount.get(listingId) ?? 0;
    if (seen >= options.imagesPerListing) {
      skippedForCap += 1;
      continue;
    }
    perListingCount.set(listingId, seen + 1);
    batch.push(IMAGE_COLUMNS.map((column) => row[column]));
    if (batch.length >= options.batchSize) {
      await bulkInsert(pg, "ListingImageRecord", IMAGE_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ListingImageRecord", IMAGE_COLUMNS, batch);
    total += batch.length;
  }
  console.log(
    `ListingImageRecord: imported ${total}${
      skippedForCap > 0
        ? ` (dropped ${skippedForCap} beyond the ${options.imagesPerListing}-per-listing cap)`
        : ""
    }`,
  );
}

const EQUIPMENT_COLUMNS = ["id", "listingId", "label"];

async function transferEquipment(
  sqlite: Database.Database,
  pg: Pool,
  listingIds: Set<string>,
  batchSize: number,
) {
  const stmt = sqlite.prepare(`SELECT ${EQUIPMENT_COLUMNS.join(", ")} FROM ListingEquipmentRecord`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    if (!listingIds.has(row.listingId as string)) continue;
    batch.push(EQUIPMENT_COLUMNS.map((column) => row[column]));
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "ListingEquipmentRecord", EQUIPMENT_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ListingEquipmentRecord", EQUIPMENT_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`ListingEquipmentRecord: imported ${total}`);
}

const IMPORT_RUN_COLUMNS = [
  "id",
  "provider",
  "sourceScope",
  "mode",
  "phase",
  "status",
  "startedAt",
  "completedAt",
  "heartbeatAt",
  "resumedCount",
  "pagesProcessed",
  "partitionsProcessed",
  "fetchedCount",
  "importedCount",
  "createdCount",
  "updatedCount",
  "unchangedCount",
  "failedCount",
  "removedCount",
  "cleanupEligible",
  "cleanupAppliedAt",
  "stopReason",
  "errorMessage",
];

async function transferImportRuns(sqlite: Database.Database, pg: Pool, batchSize: number) {
  const stmt = sqlite.prepare(`SELECT ${IMPORT_RUN_COLUMNS.join(", ")} FROM ImportRun`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    batch.push(
      IMPORT_RUN_COLUMNS.map((column) =>
        column === "cleanupEligible" ? Boolean(row[column]) : row[column],
      ),
    );
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "ImportRun", IMPORT_RUN_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ImportRun", IMPORT_RUN_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`ImportRun: imported ${total}`);
}

const IMPORT_CHECKPOINT_COLUMNS = [
  "id",
  "runId",
  "sequence",
  "status",
  "yearFrom",
  "yearTo",
  "priceFrom",
  "priceTo",
  "unboundedPriceTo",
  "mileageFrom",
  "mileageTo",
  "nextPage",
  "lastPage",
  "totalMatches",
  "processedCount",
  "createdCount",
  "updatedCount",
  "unchangedCount",
  "rejectedCount",
  "errorCount",
  "lastProcessedExternalId",
  "startedAt",
  "completedAt",
  "heartbeatAt",
  "lastError",
];

async function transferImportCheckpoints(sqlite: Database.Database, pg: Pool, batchSize: number) {
  const stmt = sqlite.prepare(`SELECT ${IMPORT_CHECKPOINT_COLUMNS.join(", ")} FROM ImportCheckpoint`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    batch.push(
      IMPORT_CHECKPOINT_COLUMNS.map((column) =>
        column === "unboundedPriceTo" ? Boolean(row[column]) : row[column],
      ),
    );
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "ImportCheckpoint", IMPORT_CHECKPOINT_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ImportCheckpoint", IMPORT_CHECKPOINT_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`ImportCheckpoint: imported ${total}`);
}

const IMPORT_RUN_ERROR_COLUMNS = [
  "id",
  "runId",
  "checkpointId",
  "phase",
  "page",
  "attempt",
  "httpStatus",
  "message",
  "requestParameters",
  "createdAt",
];

async function transferImportRunErrors(sqlite: Database.Database, pg: Pool, batchSize: number) {
  const stmt = sqlite.prepare(`SELECT ${IMPORT_RUN_ERROR_COLUMNS.join(", ")} FROM ImportRunError`);
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    batch.push(IMPORT_RUN_ERROR_COLUMNS.map((column) => row[column]));
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "ImportRunError", IMPORT_RUN_ERROR_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "ImportRunError", IMPORT_RUN_ERROR_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`ImportRunError: imported ${total}`);
}

const SYNCHRONIZATION_LOCK_COLUMNS = ["provider", "runId", "mode", "acquiredAt", "heartbeatAt"];

async function transferSynchronizationLocks(sqlite: Database.Database, pg: Pool, batchSize: number) {
  const stmt = sqlite.prepare(
    `SELECT ${SYNCHRONIZATION_LOCK_COLUMNS.join(", ")} FROM SynchronizationLock`,
  );
  let batch: unknown[][] = [];
  let total = 0;
  for (const row of stmt.iterate() as IterableIterator<Record<string, unknown>>) {
    batch.push(SYNCHRONIZATION_LOCK_COLUMNS.map((column) => row[column]));
    if (batch.length >= batchSize) {
      await bulkInsert(pg, "SynchronizationLock", SYNCHRONIZATION_LOCK_COLUMNS, batch);
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await bulkInsert(pg, "SynchronizationLock", SYNCHRONIZATION_LOCK_COLUMNS, batch);
    total += batch.length;
  }
  console.log(`SynchronizationLock: imported ${total}`);
}

async function verify(pg: Pool, listingIds: Set<string>, vehicleIds: Set<string>) {
  console.log("\n--- Verification ---");
  const counted: Record<string, number> = {};
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    if (table.startsWith("Catalog")) continue;
    const result = await pg.query(`SELECT COUNT(*)::text AS count FROM "${table}"`);
    counted[table] = Number.parseInt(result.rows[0].count, 10);
  }
  console.log(`VehicleRecord: expected ${vehicleIds.size}, found ${counted.VehicleRecord}`);
  console.log(`ListingRecord: expected ${listingIds.size}, found ${counted.ListingRecord}`);
  console.log(`ListingAnalysisRecord: found ${counted.ListingAnalysisRecord}`);
  console.log(`ListingImageRecord: found ${counted.ListingImageRecord}`);
  console.log(`ListingEquipmentRecord: found ${counted.ListingEquipmentRecord}`);

  const sample = await pg.query(`
    SELECT listing.id, vehicle.make, vehicle.model,
           (SELECT COUNT(*) FROM "ListingImageRecord" image WHERE image."listingId" = listing.id) AS "imageCount"
    FROM "ListingRecord" listing
    INNER JOIN "VehicleRecord" vehicle ON vehicle.id = listing."vehicleId"
    ORDER BY random()
    LIMIT 3
  `);
  console.log("Sample joined rows:", sample.rows);

  const sizes = await pg.query(`
    SELECT relname AS "table", pg_size_pretty(pg_total_relation_size(relid)) AS size,
           pg_total_relation_size(relid) AS bytes
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY bytes DESC
  `);
  console.log("\n--- Hosted table sizes ---");
  let totalBytes = 0;
  for (const row of sizes.rows) {
    console.log(`${row.table}: ${row.size}`);
    totalBytes += Number(row.bytes);
  }
  console.log(`Total: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  if (totalBytes > 450 * 1024 * 1024) {
    console.warn(
      "WARNING: hosted database is close to or over the 500 MB Prisma Free plan limit. Consider re-importing with a lower --max-listings or --images-per-listing.",
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) {
    throw new Error("DIRECT_URL (or DATABASE_URL) must be set to run the transfer.");
  }

  const sqlite = new Database(options.sqlitePath, { readonly: true, fileMustExist: true });
  const pg = new Pool({ connectionString: directUrl });

  const finishOnly = process.argv.includes("--finish-only");

  try {
    const listingIds = selectListingIds(sqlite, options);
    const vehicleIds = selectVehicleIds(sqlite, listingIds);

    if (finishOnly) {
      console.log("Finish-only mode: resetting sequences, refreshing facets, and verifying.");
      await resetSequence(pg, "ListingImageRecord", "id");
      await resetSequence(pg, "ListingEquipmentRecord", "id");
      console.log("\nRecomputing catalog facets against the imported data...");
      await refreshCatalogFacets();
      await verify(pg, listingIds, vehicleIds);
      return;
    }

    await assertTargetIsEmpty(pg);

    console.log(`Mode: ${options.mode}`);
    console.log(`Listings selected: ${listingIds.size} of ${countAll(sqlite, "ListingRecord")}`);
    console.log(`Vehicles selected: ${vehicleIds.size} of ${countAll(sqlite, "VehicleRecord")}`);
    if (options.mode === "slim") {
      console.log("rawPayload: dropped for every listing");
      console.log(`Images per listing: capped at ${options.imagesPerListing}`);
    }

    if (options.dryRun) {
      console.log("\nDry run: no rows were written. Source database was not modified.");
      return;
    }

    await transferVehicles(sqlite, pg, vehicleIds, options.batchSize);
    await transferListings(sqlite, pg, listingIds, options);
    await transferAnalyses(sqlite, pg, listingIds, options.batchSize);
    await transferImages(sqlite, pg, listingIds, options);
    await transferEquipment(sqlite, pg, listingIds, options.batchSize);
    await transferImportRuns(sqlite, pg, options.batchSize);
    await transferImportCheckpoints(sqlite, pg, options.batchSize);
    await transferImportRunErrors(sqlite, pg, options.batchSize);
    await transferSynchronizationLocks(sqlite, pg, options.batchSize);

    await resetSequence(pg, "ListingImageRecord", "id");
    await resetSequence(pg, "ListingEquipmentRecord", "id");

    console.log("\nRecomputing catalog facets against the imported data...");
    await refreshCatalogFacets();

    await verify(pg, listingIds, vehicleIds);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
