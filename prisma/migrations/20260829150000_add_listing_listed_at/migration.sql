-- A single recency instant per listing for the "newest" sort and the
-- "posted within" filter: the seller's publish time when the source reports
-- one, otherwise the moment we first saw the ad.
--
-- Why: `newest` ordered by `publishedAt DESC` (Postgres puts NULLs first on a
-- DESC sort) then `synchronizedAt DESC`. Sources without a publish date
-- (Hedin, older Bytbil rows) therefore pinned themselves to the very top of
-- the results regardless of age, and their tie-break — `synchronizedAt` — is
-- rewritten on every sync, so a freshly imported ad could never rise above
-- the rest of its own source. `listedAt` collapses both cases into one
-- comparable, always-present timestamp.
--
-- Maintained by the application on write (see `writeListing`): set on insert
-- to `publishedAt ?? firstSeenAt`, and refreshed on update only when the
-- source carries a `publishedAt` (a real re-publish signal). Rows without a
-- source publish date keep their original first-seen instant.

ALTER TABLE "ListingRecord" ADD COLUMN "listedAt" TIMESTAMP(3);

UPDATE "ListingRecord"
SET "listedAt" = COALESCE("publishedAt", "firstSeenAt");

CREATE INDEX "ListingRecord_status_listedAt_id_idx"
    ON "ListingRecord" ("status", "listedAt" DESC, "id");

-- Superseded by the index above; nothing sorts on this composite any more.
DROP INDEX IF EXISTS "ListingRecord_status_publishedAt_synchronizedAt_id_idx";
