-- The 20260821134030_add_fuel_consumption migration accidentally dropped the
-- hand-written pg_trgm GIN indexes that back the free-text search filter
-- (Prisma's `contains`/`mode: "insensitive"`). Two earlier migrations
-- (20260820234636_add_ownership_cost_items, 20260821001003_add_owner_count)
-- explicitly avoided dropping them for exactly this reason: they aren't
-- expressible in schema.prisma, so `prisma migrate dev` always flags them as
-- drift and will offer to drop them again on a future diff. If that happens,
-- recreate them the same way this migration does instead of letting the diff
-- drop them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "VehicleRecord_make_trgm_idx" ON "VehicleRecord" USING GIN ("make" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "VehicleRecord_model_trgm_idx" ON "VehicleRecord" USING GIN ("model" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "VehicleRecord_variant_trgm_idx" ON "VehicleRecord" USING GIN ("variant" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ListingRecord_sellerName_trgm_idx" ON "ListingRecord" USING GIN ("sellerName" gin_trgm_ops);
