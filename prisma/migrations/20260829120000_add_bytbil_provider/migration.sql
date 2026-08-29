-- Register Bytbil as a listing source. Additive only: one row in the
-- extensible provider registry, no schema or data changes to existing tables.
-- The ListingRecord.provider FK added in 20260828120000 requires this row to
-- exist before any Bytbil listing is written.
INSERT INTO "ListingProvider" (
    "key", "displayName", "sourceType", "logoKey", "capabilities"
) VALUES (
    'bytbil',
    'Bytbil',
    'marketplace',
    'bytbil',
    '{"discovery":"page","details":true,"equipment":true,"images":true,"removalDetection":true}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
