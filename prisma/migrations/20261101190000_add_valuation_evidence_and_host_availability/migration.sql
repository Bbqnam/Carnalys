ALTER TABLE "ListingRecord"
  ADD COLUMN "mileageKnown" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "availabilityConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "priceConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "availabilityEvidence" JSONB,
  ADD COLUMN "analysisRequiredAt" TIMESTAMP(3);

-- Positive legacy readings were reported numbers. Legacy zero readings are
-- ambiguous and remain unknown until the source explicitly supplies one.
UPDATE "ListingRecord" SET "mileageKnown" = true WHERE "mileageKm" > 0;
UPDATE "ListingRecord" SET "analysisRequiredAt" = CURRENT_TIMESTAMP WHERE "status" = 'active';

ALTER TABLE "ListingAnalysisRecord"
  ADD COLUMN "inputFingerprint" TEXT,
  ADD COLUMN "marketAsOf" TIMESTAMP(3),
  ADD COLUMN "valuationEvidence" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "ListingRecord_status_availabilityConfirmedAt_idx" ON "ListingRecord" ("status", "availabilityConfirmedAt");
CREATE INDEX "ListingRecord_analysisRequiredAt_idx" ON "ListingRecord" ("analysisRequiredAt");
