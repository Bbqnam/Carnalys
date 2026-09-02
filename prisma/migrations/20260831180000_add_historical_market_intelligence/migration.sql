-- Durable listing events already exist in ListingObservation. This migration
-- extends that log rather than creating a parallel history system, and adds a
-- compact dimension/fact pair for rebuildable daily market snapshots.

CREATE TYPE "ListingObservationKind" AS ENUM (
  'first_seen',
  'price_change',
  'mileage_change',
  'status_change',
  'disappeared',
  'relisted',
  'seller_change',
  'other_meaningful_change'
);

CREATE TYPE "ListingObservationProvenance" AS ENUM ('observed', 'reconstructed');

ALTER TABLE "ListingObservation"
  ALTER COLUMN "kind" TYPE "ListingObservationKind"
    USING "kind"::"ListingObservationKind",
  ADD COLUMN "previousMileageKm" INTEGER,
  ADD COLUMN "previousSellerType" TEXT,
  ADD COLUMN "sellerName" TEXT,
  ADD COLUMN "previousSellerName" TEXT,
  ADD COLUMN "sellerOrganizationNumber" TEXT,
  ADD COLUMN "previousSellerOrganizationNumber" TEXT,
  ADD COLUMN "provenance" "ListingObservationProvenance" NOT NULL DEFAULT 'observed';

-- The original history migration reconstructed first/last lifecycle facts
-- from ListingRecord. Its own completion timestamp gives us an exact boundary
-- between those safe reconstructions and events captured live afterwards.
UPDATE "ListingObservation"
SET "provenance" = 'reconstructed'
WHERE "createdAt" <= COALESCE(
  (
    SELECT "finished_at"
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260822210639_add_listing_observation_history'
    LIMIT 1
  ),
  '-infinity'::timestamptz
);

-- Close any small race between the original bootstrap migration and listings
-- ingested at the same time. The current state is useful from *this migration
-- onward* only, which is why these rows are explicitly reconstructed.
INSERT INTO "ListingObservation" (
  "listingId", "provider", "observedAt", "kind", "priceAmount",
  "previousPriceAmount", "mileageKm", "sellerType", "sellerName",
  "sellerOrganizationNumber", "status", "provenance"
)
SELECT
  listing."id", listing."provider", listing."firstSeenAt", 'first_seen',
  listing."priceAmount", listing."previousPriceAmount", listing."mileageKm",
  listing."sellerType", listing."sellerName",
  listing."sellerOrganizationNumber", listing."status", 'reconstructed'
FROM "ListingRecord" AS listing
WHERE NOT EXISTS (
  SELECT 1
  FROM "ListingObservation" AS observation
  WHERE observation."listingId" = listing."id"
    AND observation."kind" = 'first_seen'
)
ON CONFLICT DO NOTHING;

INSERT INTO "ListingObservation" (
  "listingId", "provider", "observedAt", "kind", "priceAmount",
  "previousPriceAmount", "mileageKm", "sellerType", "sellerName",
  "sellerOrganizationNumber", "status", "provenance"
)
SELECT
  listing."id", listing."provider", listing."removedAt", 'disappeared',
  listing."priceAmount", listing."previousPriceAmount", listing."mileageKm",
  listing."sellerType", listing."sellerName",
  listing."sellerOrganizationNumber", 'removed', 'reconstructed'
FROM "ListingRecord" AS listing
WHERE listing."removedAt" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ListingObservation" AS observation
    WHERE observation."listingId" = listing."id"
      AND observation."kind" = 'disappeared'
  )
ON CONFLICT DO NOTHING;

CREATE TABLE "MarketCohort" (
  "id" BIGSERIAL NOT NULL,
  "cohortKey" TEXT NOT NULL,
  "granularity" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "fuelType" TEXT,
  "transmission" TEXT,
  "modelYear" INTEGER,
  "mileageBucket" INTEGER,
  "normalizationVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketCohort_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketSnapshot" (
  "id" BIGSERIAL NOT NULL,
  "cohortId" BIGINT NOT NULL,
  "snapshotDate" DATE NOT NULL,
  "sourceWatermark" TIMESTAMP(3) NOT NULL,
  "activeListingCount" INTEGER NOT NULL,
  "medianPriceAmount" INTEGER NOT NULL,
  "averagePriceAmount" INTEGER NOT NULL,
  "minimumPriceAmount" INTEGER NOT NULL,
  "maximumPriceAmount" INTEGER NOT NULL,
  "priceP10Amount" INTEGER NOT NULL,
  "priceP25Amount" INTEGER NOT NULL,
  "priceP75Amount" INTEGER NOT NULL,
  "priceP90Amount" INTEGER NOT NULL,
  "medianMileageKm" INTEGER NOT NULL,
  "averageMileageKm" INTEGER NOT NULL,
  "medianDaysOnMarket" DOUBLE PRECISION NOT NULL,
  "averageDaysOnMarket" DOUBLE PRECISION NOT NULL,
  "newListingCount" INTEGER NOT NULL,
  "reactivatedListingCount" INTEGER NOT NULL,
  "removedListingCount" INTEGER NOT NULL,
  "priceReductionCount" INTEGER NOT NULL,
  "priceReductionListingCount" INTEGER NOT NULL,
  "medianPriceReductionAmount" INTEGER,
  "averagePriceReductionAmount" INTEGER,
  "priceReductionShare" DOUBLE PRECISION NOT NULL,
  "medianDealScore" DOUBLE PRECISION,
  "medianMarketValueAmount" INTEGER,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketCohort_cohortKey_key" ON "MarketCohort"("cohortKey");
CREATE INDEX "MarketCohort_make_model_granularity_normalizationVersion_idx"
  ON "MarketCohort"("make", "model", "granularity", "normalizationVersion");
CREATE UNIQUE INDEX "MarketSnapshot_cohortId_snapshotDate_key"
  ON "MarketSnapshot"("cohortId", "snapshotDate");
CREATE INDEX "MarketSnapshot_snapshotDate_idx" ON "MarketSnapshot"("snapshotDate");

ALTER TABLE "MarketSnapshot"
  ADD CONSTRAINT "MarketSnapshot_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "MarketCohort"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A vehicle identity cleanup must never cascade-delete a lifetime listing.
-- Vehicle merges already repoint listings explicitly before removing a stale
-- identity; RESTRICT turns any future accidental delete into a visible error.
ALTER TABLE "ListingRecord" DROP CONSTRAINT "ListingRecord_vehicleId_fkey";
ALTER TABLE "ListingRecord"
  ADD CONSTRAINT "ListingRecord_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "VehicleRecord"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
