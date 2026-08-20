-- CreateTable
CREATE TABLE "VehicleRecord" (
    "id" TEXT NOT NULL,
    "vin" TEXT,
    "registrationNumber" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "modelYear" INTEGER NOT NULL,
    "registrationYear" INTEGER,
    "bodyStyle" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "transmission" TEXT NOT NULL,
    "drivetrain" TEXT,
    "horsepower" INTEGER,
    "engineDescription" TEXT,
    "engineDisplacement" INTEGER,
    "firstRegistration" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingRecord" (
    "id" TEXT NOT NULL,
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
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "description" TEXT,
    "serviceHistory" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'active',
    "publishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "synchronizedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "contentHash" TEXT,
    "imageHash" TEXT,
    "equipmentHash" TEXT,
    "missingReconciliationCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAnalysisRecord" (
    "listingId" TEXT NOT NULL,
    "marketValueAmount" INTEGER NOT NULL,
    "marketValueMinimum" INTEGER NOT NULL,
    "marketValueMaximum" INTEGER NOT NULL,
    "comparableCount" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "dealScore" INTEGER NOT NULL,
    "buyConfidenceScore" INTEGER NOT NULL,
    "annualOwnershipCost" INTEGER NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "sourceSynchronizedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingAnalysisRecord_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "ListingImageRecord" (
    "id" SERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "alt" TEXT,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "ListingImageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingEquipmentRecord" (
    "id" SERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ListingEquipmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceScope" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'incremental',
    "phase" TEXT NOT NULL DEFAULT 'starting',
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
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
    "cleanupAppliedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCheckpoint" (
    "id" TEXT NOT NULL,
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
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ImportCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunError" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "checkpointId" TEXT,
    "phase" TEXT NOT NULL,
    "page" INTEGER,
    "attempt" INTEGER,
    "httpStatus" INTEGER,
    "message" TEXT NOT NULL,
    "requestParameters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRunError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SynchronizationLock" (
    "provider" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SynchronizationLock_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "CatalogMakeFacet" (
    "make" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMakeFacet_pkey" PRIMARY KEY ("make")
);

-- CreateTable
CREATE TABLE "CatalogModelFacet" (
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogModelFacet_pkey" PRIMARY KEY ("make","model")
);

-- CreateTable
CREATE TABLE "CatalogYearFacet" (
    "modelYear" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogYearFacet_pkey" PRIMARY KEY ("modelYear")
);

-- CreateTable
CREATE TABLE "CatalogSummary" (
    "id" TEXT NOT NULL,
    "activeListingCount" INTEGER NOT NULL,
    "minimumPrice" INTEGER NOT NULL,
    "maximumPrice" INTEGER NOT NULL,
    "lastSynchronizedAt" TIMESTAMP(3),
    "facetsUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleRecord_vin_key" ON "VehicleRecord"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleRecord_registrationNumber_key" ON "VehicleRecord"("registrationNumber");

-- CreateIndex
CREATE INDEX "VehicleRecord_make_model_idx" ON "VehicleRecord"("make", "model");

-- CreateIndex
CREATE INDEX "VehicleRecord_modelYear_idx" ON "VehicleRecord"("modelYear");

-- CreateIndex
CREATE INDEX "ListingRecord_provider_sourceScope_status_idx" ON "ListingRecord"("provider", "sourceScope", "status");

-- CreateIndex
CREATE INDEX "ListingRecord_vehicleId_idx" ON "ListingRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "ListingRecord_vehicleId_status_idx" ON "ListingRecord"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "ListingRecord_status_priceAmount_idx" ON "ListingRecord"("status", "priceAmount");

-- CreateIndex
CREATE INDEX "ListingRecord_status_publishedAt_synchronizedAt_id_idx" ON "ListingRecord"("status", "publishedAt", "synchronizedAt", "id");

-- CreateIndex
CREATE INDEX "ListingRecord_provider_sourceScope_status_lastSeenAt_idx" ON "ListingRecord"("provider", "sourceScope", "status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ListingRecord_mileageKm_idx" ON "ListingRecord"("mileageKm");

-- CreateIndex
CREATE INDEX "ListingRecord_lastSeenAt_idx" ON "ListingRecord"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingRecord_provider_externalId_key" ON "ListingRecord"("provider", "externalId");

-- CreateIndex
CREATE INDEX "ListingAnalysisRecord_calculatedAt_idx" ON "ListingAnalysisRecord"("calculatedAt");

-- CreateIndex
CREATE INDEX "ListingImageRecord_listingId_position_idx" ON "ListingImageRecord"("listingId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImageRecord_listingId_url_key" ON "ListingImageRecord"("listingId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "ListingEquipmentRecord_listingId_label_key" ON "ListingEquipmentRecord"("listingId", "label");

-- CreateIndex
CREATE INDEX "ImportRun_provider_startedAt_idx" ON "ImportRun"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_provider_sourceScope_mode_status_startedAt_idx" ON "ImportRun"("provider", "sourceScope", "mode", "status", "startedAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_heartbeatAt_idx" ON "ImportRun"("status", "heartbeatAt");

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

-- AddForeignKey
ALTER TABLE "ListingRecord" ADD CONSTRAINT "ListingRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "VehicleRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAnalysisRecord" ADD CONSTRAINT "ListingAnalysisRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImageRecord" ADD CONSTRAINT "ListingImageRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingEquipmentRecord" ADD CONSTRAINT "ListingEquipmentRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCheckpoint" ADD CONSTRAINT "ImportCheckpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRunError" ADD CONSTRAINT "ImportRunError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynchronizationLock" ADD CONSTRAINT "SynchronizationLock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
