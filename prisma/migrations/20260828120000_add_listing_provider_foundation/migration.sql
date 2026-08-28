-- Additive multi-source foundation. Existing listing/history identifiers are
-- preserved; no rows are rewritten or removed.
CREATE TABLE "ListingProvider" (
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'marketplace',
    "logoKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingProvider_pkey" PRIMARY KEY ("key")
);

INSERT INTO "ListingProvider" (
    "key", "displayName", "sourceType", "logoKey", "capabilities"
) VALUES
    ('blocket_unofficial', 'Blocket', 'marketplace', 'blocket', '{"discovery":"page","details":true,"removalDetection":true}'::jsonb),
    ('wayke', 'Wayke', 'marketplace', 'wayke', '{"discovery":"offset","details":true,"removalDetection":true}'::jsonb)
ON CONFLICT ("key") DO NOTHING;

-- Future-proof the foreign key if a deployment already contains a provider
-- introduced outside this release. Known sources above retain their curated
-- names/logo; unknown keys receive a safe neutral registry entry.
INSERT INTO "ListingProvider" ("key", "displayName", "sourceType")
SELECT DISTINCT "provider", "provider", 'marketplace'
FROM "ListingRecord"
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "ListingRecord"
    ADD COLUMN "title" TEXT,
    ADD COLUMN "sellerOrganizationNumber" TEXT,
    ADD COLUMN "dealerStockNumber" TEXT,
    ADD COLUMN "vehicleMatchMethod" TEXT,
    ADD COLUMN "vehicleMatchConfidence" DOUBLE PRECISION;

ALTER TABLE "ListingRecord"
    ADD CONSTRAINT "ListingRecord_provider_fkey"
    FOREIGN KEY ("provider") REFERENCES "ListingProvider"("key")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Validation scans existing rows without taking the stronger lock held by a
-- one-step validated FK addition, reducing interference with live reads/writes.
ALTER TABLE "ListingRecord"
    VALIDATE CONSTRAINT "ListingRecord_provider_fkey";

-- Most historical listings have no dealer stock number. A partial index keeps
-- exact future dealer matching cheap without indexing a catalog full of NULLs.
CREATE INDEX "ListingRecord_sellerName_dealerStockNumber_idx"
    ON "ListingRecord"("sellerName", "dealerStockNumber")
    WHERE "dealerStockNumber" IS NOT NULL;
