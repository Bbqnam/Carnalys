-- AlterTable
ALTER TABLE "ListingAnalysisRecord" ADD COLUMN     "buyConfidenceFactors" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dealScoreFactors" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "ListingAnalysisRecord_dealScore_idx" ON "ListingAnalysisRecord"("dealScore");

-- CreateIndex
CREATE INDEX "ListingAnalysisRecord_buyConfidenceScore_idx" ON "ListingAnalysisRecord"("buyConfidenceScore");

-- Trigram search support for the case-insensitive ILIKE free-text search
-- (Prisma's `contains`/`mode: "insensitive"`). Not expressible via @@index
-- in schema.prisma, so it's hand-written here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "VehicleRecord_make_trgm_idx" ON "VehicleRecord" USING GIN ("make" gin_trgm_ops);
CREATE INDEX "VehicleRecord_model_trgm_idx" ON "VehicleRecord" USING GIN ("model" gin_trgm_ops);
CREATE INDEX "VehicleRecord_variant_trgm_idx" ON "VehicleRecord" USING GIN ("variant" gin_trgm_ops);
CREATE INDEX "ListingRecord_sellerName_trgm_idx" ON "ListingRecord" USING GIN ("sellerName" gin_trgm_ops);
