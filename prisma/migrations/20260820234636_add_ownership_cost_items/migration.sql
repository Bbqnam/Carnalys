-- Note: Prisma's diff wanted to DROP the hand-written pg_trgm GIN indexes
-- here (ListingRecord_sellerName_trgm_idx, VehicleRecord_make_trgm_idx,
-- VehicleRecord_model_trgm_idx, VehicleRecord_variant_trgm_idx) because they
-- aren't expressible in schema.prisma and so show up as "drift" on every
-- migrate diff. Intentionally NOT dropping them — they back the free-text
-- search. Strip any DROP INDEX for these from future generated migrations too.

-- AlterTable
ALTER TABLE "ListingAnalysisRecord" ADD COLUMN     "ownershipCostItems" JSONB NOT NULL DEFAULT '[]';
