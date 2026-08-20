-- CreateTable
CREATE TABLE "ListingAnalysisRecord" (
    "listingId" TEXT NOT NULL PRIMARY KEY,
    "marketValueAmount" INTEGER NOT NULL,
    "marketValueMinimum" INTEGER NOT NULL,
    "marketValueMaximum" INTEGER NOT NULL,
    "comparableCount" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "dealScore" INTEGER NOT NULL,
    "buyConfidenceScore" INTEGER NOT NULL,
    "annualOwnershipCost" INTEGER NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL,
    "sourceSynchronizedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingAnalysisRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "yearFrom" INTEGER NOT NULL,
    "yearTo" INTEGER NOT NULL,
    "priceFrom" INTEGER NOT NULL,
    "priceTo" INTEGER NOT NULL,
    "unboundedPriceTo" BOOLEAN NOT NULL DEFAULT false,
    "mileageFrom" INTEGER NOT NULL,
    "mileageTo" INTEGER NOT NULL,
    "nextPage" INTEGER NOT NULL DEFAULT 1,
    "lastPage" INTEGER,
    "totalMatches" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedExternalId" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "heartbeatAt" DATETIME,
    "lastError" TEXT,
    CONSTRAINT "ImportCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRunError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "checkpointId" TEXT,
    "phase" TEXT NOT NULL,
    "page" INTEGER,
    "attempt" INTEGER,
    "httpStatus" INTEGER,
    "message" TEXT NOT NULL,
    "requestParameters" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRunError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SynchronizationLock" (
    "provider" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "acquiredAt" DATETIME NOT NULL,
    "heartbeatAt" DATETIME NOT NULL,
    CONSTRAINT "SynchronizationLock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogMakeFacet" (
    "make" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogModelFacet" (
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("make", "model")
);

-- CreateTable
CREATE TABLE "CatalogYearFacet" (
    "modelYear" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "count" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activeListingCount" INTEGER NOT NULL,
    "minimumPrice" INTEGER NOT NULL,
    "maximumPrice" INTEGER NOT NULL,
    "lastSynchronizedAt" DATETIME,
    "facetsUpdatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sourceScope" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'incremental',
    "phase" TEXT NOT NULL DEFAULT 'starting',
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "heartbeatAt" DATETIME,
    "resumedCount" INTEGER NOT NULL DEFAULT 0,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "partitionsProcessed" INTEGER NOT NULL DEFAULT 0,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "cleanupEligible" BOOLEAN NOT NULL DEFAULT false,
    "stopReason" TEXT,
    "errorMessage" TEXT
);
INSERT INTO "new_ImportRun" ("completedAt", "errorMessage", "failedCount", "fetchedCount", "id", "importedCount", "provider", "removedCount", "sourceScope", "startedAt", "status") SELECT "completedAt", "errorMessage", "failedCount", "fetchedCount", "id", "importedCount", "provider", "removedCount", "sourceScope", "startedAt", "status" FROM "ImportRun";
DROP TABLE "ImportRun";
ALTER TABLE "new_ImportRun" RENAME TO "ImportRun";
CREATE INDEX "ImportRun_provider_startedAt_idx" ON "ImportRun"("provider", "startedAt");
CREATE INDEX "ImportRun_provider_sourceScope_mode_status_startedAt_idx" ON "ImportRun"("provider", "sourceScope", "mode", "status", "startedAt");
CREATE INDEX "ImportRun_status_heartbeatAt_idx" ON "ImportRun"("status", "heartbeatAt");
CREATE TABLE "new_ListingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sourceScope" TEXT NOT NULL DEFAULT 'default',
    "externalId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "listingUrl" TEXT NOT NULL,
    "sellerName" TEXT,
    "sellerType" TEXT NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "previousPriceAmount" INTEGER,
    "monthlyCostAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SEK',
    "mileageKm" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "description" TEXT,
    "serviceHistory" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'active',
    "publishedAt" DATETIME,
    "sourceUpdatedAt" DATETIME,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "synchronizedAt" DATETIME NOT NULL,
    "removedAt" DATETIME,
    "rawPayload" JSONB,
    "contentHash" TEXT,
    "imageHash" TEXT,
    "equipmentHash" TEXT,
    "missingReconciliationCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ListingRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "VehicleRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ListingRecord" ("currency", "description", "externalId", "firstSeenAt", "id", "lastSeenAt", "listingUrl", "location", "mileageKm", "monthlyCostAmount", "municipality", "previousPriceAmount", "priceAmount", "provider", "publishedAt", "rawPayload", "removedAt", "sellerName", "sellerType", "serviceHistory", "sourceScope", "sourceUpdatedAt", "status", "synchronizedAt", "vehicleId") SELECT "currency", "description", "externalId", "firstSeenAt", "id", "lastSeenAt", "listingUrl", "location", "mileageKm", "monthlyCostAmount", "municipality", "previousPriceAmount", "priceAmount", "provider", "publishedAt", "rawPayload", "removedAt", "sellerName", "sellerType", "serviceHistory", "sourceScope", "sourceUpdatedAt", "status", "synchronizedAt", "vehicleId" FROM "ListingRecord";
DROP TABLE "ListingRecord";
ALTER TABLE "new_ListingRecord" RENAME TO "ListingRecord";
CREATE INDEX "ListingRecord_provider_sourceScope_status_idx" ON "ListingRecord"("provider", "sourceScope", "status");
CREATE INDEX "ListingRecord_status_priceAmount_idx" ON "ListingRecord"("status", "priceAmount");
CREATE INDEX "ListingRecord_status_publishedAt_synchronizedAt_id_idx" ON "ListingRecord"("status", "publishedAt", "synchronizedAt", "id");
CREATE INDEX "ListingRecord_provider_sourceScope_status_lastSeenAt_idx" ON "ListingRecord"("provider", "sourceScope", "status", "lastSeenAt");
CREATE INDEX "ListingRecord_mileageKm_idx" ON "ListingRecord"("mileageKm");
CREATE INDEX "ListingRecord_lastSeenAt_idx" ON "ListingRecord"("lastSeenAt");
CREATE UNIQUE INDEX "ListingRecord_provider_externalId_key" ON "ListingRecord"("provider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ListingAnalysisRecord_calculatedAt_idx" ON "ListingAnalysisRecord"("calculatedAt");

-- CreateIndex
CREATE INDEX "ImportCheckpoint_runId_status_sequence_idx" ON "ImportCheckpoint"("runId", "status", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ImportCheckpoint_runId_sequence_key" ON "ImportCheckpoint"("runId", "sequence");

-- CreateIndex
CREATE INDEX "ImportRunError_runId_createdAt_idx" ON "ImportRunError"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SynchronizationLock_runId_key" ON "SynchronizationLock"("runId");

-- CreateIndex
CREATE INDEX "CatalogModelFacet_model_idx" ON "CatalogModelFacet"("model");
