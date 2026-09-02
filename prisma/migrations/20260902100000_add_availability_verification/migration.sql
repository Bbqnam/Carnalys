ALTER TABLE "ListingRecord"
ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3),
ADD COLUMN "availabilityCheckStatus" TEXT;

CREATE INDEX "ListingRecord_provider_status_availabilityCheckedAt_idx"
ON "ListingRecord"("provider", "status", "availabilityCheckedAt");
