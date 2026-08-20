CREATE TABLE "VehicleRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "firstRegistration" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ListingRecord" (
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
    CONSTRAINT "ListingRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "VehicleRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ListingImageRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "alt" TEXT,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    CONSTRAINT "ListingImageRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ListingEquipmentRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listingId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    CONSTRAINT "ListingEquipmentRecord_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "ListingRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sourceScope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
);

CREATE UNIQUE INDEX "VehicleRecord_vin_key" ON "VehicleRecord"("vin");
CREATE UNIQUE INDEX "VehicleRecord_registrationNumber_key" ON "VehicleRecord"("registrationNumber");
CREATE INDEX "VehicleRecord_make_model_idx" ON "VehicleRecord"("make", "model");
CREATE INDEX "VehicleRecord_modelYear_idx" ON "VehicleRecord"("modelYear");
CREATE INDEX "ListingRecord_provider_sourceScope_status_idx" ON "ListingRecord"("provider", "sourceScope", "status");
CREATE INDEX "ListingRecord_status_priceAmount_idx" ON "ListingRecord"("status", "priceAmount");
CREATE INDEX "ListingRecord_mileageKm_idx" ON "ListingRecord"("mileageKm");
CREATE INDEX "ListingRecord_lastSeenAt_idx" ON "ListingRecord"("lastSeenAt");
CREATE UNIQUE INDEX "ListingRecord_provider_externalId_key" ON "ListingRecord"("provider", "externalId");
CREATE INDEX "ListingImageRecord_listingId_position_idx" ON "ListingImageRecord"("listingId", "position");
CREATE UNIQUE INDEX "ListingImageRecord_listingId_url_key" ON "ListingImageRecord"("listingId", "url");
CREATE UNIQUE INDEX "ListingEquipmentRecord_listingId_label_key" ON "ListingEquipmentRecord"("listingId", "label");
CREATE INDEX "ImportRun_provider_startedAt_idx" ON "ImportRun"("provider", "startedAt");
