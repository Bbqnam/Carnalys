-- Register Autohero (AUTO1 Group's Swedish online used-car retailer) as a
-- listing source. Additive only: one row in the extensible provider registry,
-- no schema or data changes to existing tables. The ListingRecord.provider FK
-- added in 20260828120000 requires this row before any Autohero listing writes.
INSERT INTO "ListingProvider" (
    "key", "displayName", "sourceType", "logoKey", "capabilities"
) VALUES (
    'autohero',
    'Autohero',
    'dealer',
    'autohero',
    '{"discovery":"offset","details":true,"equipment":true,"images":true,"removalDetection":true}'::jsonb
)
ON CONFLICT ("key") DO NOTHING;
