CREATE TABLE "ListingFactObservation" (
  "id" BIGSERIAL PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "contentHash" TEXT NOT NULL,
  "normalizationVersion" TEXT NOT NULL,
  "facts" JSONB NOT NULL
);
CREATE UNIQUE INDEX "ListingFactObservation_listingId_observedAt_contentHash_key" ON "ListingFactObservation"("listingId", "observedAt", "contentHash");
CREATE INDEX "ListingFactObservation_listingId_observedAt_idx" ON "ListingFactObservation"("listingId", "observedAt");
CREATE INDEX "ListingFactObservation_vehicleId_observedAt_idx" ON "ListingFactObservation"("vehicleId", "observedAt");
