-- Nothing reads listing images by URL: the app selects them by listingId
-- ordered by position, and the sync replaces a listing's whole gallery with
-- one delete-then-insert instead of upserting row by row. At 100k listings x
-- 8 photos this index measured 244 MB against a 180 MB heap — about half the
-- table's total footprint — and it also turned a source gallery that repeats
-- a URL into a failed write for that listing.
DROP INDEX IF EXISTS "ListingImageRecord_listingId_url_key";

-- The trigram indexes on ListingRecord.sellerName and VehicleRecord's
-- make/model/variant are created by 20260822080501_restore_trgm_search_indexes
-- as raw SQL, so they are invisible to the Prisma schema and every generated
-- migration proposes dropping them. They back the search page — leave them.
