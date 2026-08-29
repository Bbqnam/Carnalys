-- Register Hedin Automotive (direct dealer group) as a listing source.
-- Additive: one row in the extensible provider registry. The
-- ListingRecord.provider FK requires this row before any Hedin listing writes.
INSERT INTO "ListingProvider" (
    "key", "displayName", "sourceType", "logoKey", "capabilities"
) VALUES (
    'hedin',
    'Hedin',
    'dealer',
    'hedin',
    '{"discovery":"page","details":true,"equipment":true,"images":true,"removalDetection":true}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
