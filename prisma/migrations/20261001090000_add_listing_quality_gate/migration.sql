-- Additive data-quality gate. Existing rows stay valuation eligible until a
-- synchronization/backfill evaluates them; newly written rows receive a
-- deterministic status and stable reason codes.

ALTER TABLE "VehicleRecord"
ADD COLUMN "powertrainType" TEXT;

ALTER TABLE "ListingRecord"
ADD COLUMN "validationStatus" TEXT NOT NULL DEFAULT 'unchecked',
ADD COLUMN "validationReasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "valuationEligible" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "validatedAt" TIMESTAMP(3);

CREATE INDEX "ListingRecord_valuationEligible_status_idx"
ON "ListingRecord"("valuationEligible", "status");
