ALTER TABLE "ListingRecord" ADD COLUMN "latitude" REAL;
ALTER TABLE "ListingRecord" ADD COLUMN "longitude" REAL;

UPDATE "ListingRecord"
SET
  "latitude" = json_extract("rawPayload", '$.search.coordinates.lat'),
  "longitude" = json_extract("rawPayload", '$.search.coordinates.lon')
WHERE
  json_type("rawPayload", '$.search.coordinates.lat') IN ('integer', 'real')
  AND json_type("rawPayload", '$.search.coordinates.lon') IN ('integer', 'real');
