-- Legacy runs predate heartbeats and resumable checkpoints. Treat unfinished
-- rows as interrupted so they can never masquerade as active locks.
UPDATE "ImportRun"
SET
  "mode" = CASE
    WHEN "sourceScope" = 'all-cars' THEN 'reconciliation'
    ELSE 'incremental'
  END,
  "phase" = 'legacy',
  "status" = CASE WHEN "status" = 'running' THEN 'interrupted' ELSE "status" END,
  "completedAt" = CASE
    WHEN "status" = 'running' THEN CURRENT_TIMESTAMP
    ELSE "completedAt"
  END,
  "heartbeatAt" = COALESCE("completedAt", "startedAt"),
  "stopReason" = CASE
    WHEN "status" = 'running' THEN 'legacy_stale_run'
    ELSE "stopReason"
  END;

-- Give existing listings a cheap stored baseline. The background analyzer
-- can replace these neutral values without making page requests calculate
-- market cohorts on demand.
INSERT OR IGNORE INTO "ListingAnalysisRecord" (
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
  "sourceSynchronizedAt"
)
SELECT
  listing."id",
  listing."priceAmount",
  MAX(1000, ROUND(listing."priceAmount" * 0.9 / 1000.0) * 1000),
  MAX(1000, ROUND(listing."priceAmount" * 1.1 / 1000.0) * 1000),
  0,
  'low',
  70,
  70,
  ROUND(34000 + listing."priceAmount" * 0.065),
  'stored-neutral-1.0',
  CURRENT_TIMESTAMP,
  listing."synchronizedAt"
FROM "ListingRecord" AS listing;

INSERT INTO "CatalogMakeFacet" ("make", "count", "updatedAt")
SELECT vehicle."make", COUNT(*), CURRENT_TIMESTAMP
FROM "ListingRecord" AS listing
INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
WHERE listing."status" = 'active'
GROUP BY vehicle."make";

INSERT INTO "CatalogModelFacet" ("make", "model", "count", "updatedAt")
SELECT vehicle."make", vehicle."model", COUNT(*), CURRENT_TIMESTAMP
FROM "ListingRecord" AS listing
INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
WHERE listing."status" = 'active'
GROUP BY vehicle."make", vehicle."model";

INSERT INTO "CatalogYearFacet" ("modelYear", "count", "updatedAt")
SELECT vehicle."modelYear", COUNT(*), CURRENT_TIMESTAMP
FROM "ListingRecord" AS listing
INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
WHERE listing."status" = 'active'
GROUP BY vehicle."modelYear";

INSERT INTO "CatalogSummary" (
  "id",
  "activeListingCount",
  "minimumPrice",
  "maximumPrice",
  "lastSynchronizedAt",
  "facetsUpdatedAt"
)
SELECT
  'active-catalog',
  COUNT(*),
  COALESCE(MIN("priceAmount"), 0),
  COALESCE(MAX("priceAmount"), 0),
  MAX("synchronizedAt"),
  CURRENT_TIMESTAMP
FROM "ListingRecord"
WHERE "status" = 'active';
