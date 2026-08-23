-- Historical market observations.
--
-- Until now the database kept only each listing's *current* state: every sync
-- overwrote priceAmount/mileageKm/status in place, so nothing could answer
-- "what did this market look like in March?". This table is the durable,
-- append-only record that makes historical analysis possible. It is written
-- only when an observed value changes (see recordListingObservations), so a
-- listing that sits unchanged through hundreds of crawler runs still occupies
-- exactly one row.
--
-- NOTE: the four `*_trgm_idx` GIN indexes that back free-text search are not
-- expressible in schema.prisma, so `prisma migrate dev` diffs them as drift
-- and offers to drop them on every migration. They were deliberately left in
-- place here — see 20260822080501_restore_trgm_search_indexes.

-- CreateTable
CREATE TABLE "ListingObservation" (
    "id" BIGSERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "priceAmount" INTEGER NOT NULL,
    "previousPriceAmount" INTEGER,
    "mileageKm" INTEGER NOT NULL,
    "sellerType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingObservation_listingId_observedAt_idx" ON "ListingObservation"("listingId", "observedAt");

-- CreateIndex
CREATE INDEX "ListingObservation_observedAt_idx" ON "ListingObservation"("observedAt");

-- CreateIndex
CREATE INDEX "ListingObservation_kind_observedAt_idx" ON "ListingObservation"("kind", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingObservation_listingId_observedAt_kind_key" ON "ListingObservation"("listingId", "observedAt", "kind");

-- Seed the log from the state we already hold, so history starts from the
-- first time each known listing was actually seen rather than from this
-- migration. `firstSeenAt` is a real recorded timestamp; the price/mileage
-- carried with it is the only one ever recorded for that listing, since no
-- earlier value was retained anywhere. That makes this a faithful first
-- observation, not invented history — and it is the reason coverage reported
-- by the Analysis page starts at the crawler's own start date, not earlier.
INSERT INTO "ListingObservation" (
    "listingId", "provider", "observedAt", "kind",
    "priceAmount", "previousPriceAmount", "mileageKm", "sellerType", "status"
)
SELECT
    "id", "provider", "firstSeenAt", 'first_seen',
    "priceAmount", "previousPriceAmount", "mileageKm", "sellerType", 'active'
FROM "ListingRecord"
ON CONFLICT DO NOTHING;

-- Listings already known to have left the marketplace get their exit recorded
-- too. A disappearance is not a sale; `disappeared` says only that the ad is
-- gone.
INSERT INTO "ListingObservation" (
    "listingId", "provider", "observedAt", "kind",
    "priceAmount", "previousPriceAmount", "mileageKm", "sellerType", "status"
)
SELECT
    "id", "provider", "removedAt", 'disappeared',
    "priceAmount", "previousPriceAmount", "mileageKm", "sellerType", "status"
FROM "ListingRecord"
WHERE "removedAt" IS NOT NULL
ON CONFLICT DO NOTHING;
