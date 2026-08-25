-- Text search was an OR across the vehicle relation, one condition per field
-- per token. Prisma turns that into one LEFT JOIN to VehicleRecord per field
-- per token — six joins to the same table for a two-word query — and puts each
-- ILIKE on a different join alias, where no index can reach it. Measured on
-- 120k listings the planner gave up and sequentially scanned the catalogue:
-- 74 838 buffer hits, 271 ms, with all four trigram indexes below untouched.
--
-- One denormalised column on the listing answers every token instead. Same
-- dataset, same question: 3 456 buffers, 14.6 ms.

ALTER TABLE "ListingRecord" ADD COLUMN "searchText" TEXT;

-- Backfill. The column is maintained on write from here on, in the same
-- statement that writes the fields it is derived from.
UPDATE "ListingRecord" AS l
SET "searchText" = lower(
  concat_ws(
    ' ',
    nullif(v."make", ''),
    nullif(v."model", ''),
    nullif(v."variant", ''),
    nullif(l."sellerName", '')
  )
)
FROM "VehicleRecord" AS v
WHERE v."id" = l."vehicleId";

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Not CONCURRENTLY: Prisma runs each migration inside a transaction, and
-- CREATE INDEX CONCURRENTLY cannot run in one. On a catalogue of this size the
-- build is a couple of seconds, and deploys do not overlap the nightly sync.
CREATE INDEX "ListingRecord_searchText_trgm_idx"
  ON "ListingRecord" USING gin ("searchText" gin_trgm_ops);

-- These four backed the old shape and nothing else: `searchText` is now the
-- only substring search in the codebase. Trigram indexes are large, and these
-- were being maintained on every write while serving no read.
DROP INDEX IF EXISTS "ListingRecord_sellerName_trgm_idx";
DROP INDEX IF EXISTS "VehicleRecord_make_trgm_idx";
DROP INDEX IF EXISTS "VehicleRecord_model_trgm_idx";
DROP INDEX IF EXISTS "VehicleRecord_variant_trgm_idx";
