-- Facelift dimension on VehicleRecord + valuation confidence/explainability on
-- ListingAnalysisRecord. Additive and nullable/defaulted — no data is
-- rewritten by the migration itself; the taxonomy backfill and the next
-- analysis sweep populate these column by column.

ALTER TABLE "VehicleRecord"
ADD COLUMN "facelift" BOOLEAN;

ALTER TABLE "ListingAnalysisRecord"
ADD COLUMN "valuationConfidenceScore" INTEGER,
ADD COLUMN "valuationConfidenceLabel" TEXT,
ADD COLUMN "comparableInsights" JSONB NOT NULL DEFAULT '[]';
