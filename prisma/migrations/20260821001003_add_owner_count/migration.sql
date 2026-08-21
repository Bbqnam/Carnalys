-- Not dropping the hand-written pg_trgm GIN indexes here (see the note in
-- 20260820234636_add_ownership_cost_items/migration.sql) — Prisma's diff
-- flags them as drift on every migration since they aren't expressible in
-- schema.prisma, but they back the free-text search and must stay.

-- AlterTable
ALTER TABLE "ListingRecord" ADD COLUMN     "ownerCount" INTEGER;
