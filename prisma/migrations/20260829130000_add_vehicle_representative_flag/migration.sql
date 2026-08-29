-- One card per physical vehicle in the results grid. Additive: a flag on the
-- existing table plus a backfill. Every source listing is still stored and
-- reachable (vehicle detail page, source-filtered search); this only marks
-- which listing stands in for the car when results are not source-filtered.

ALTER TABLE "ListingRecord"
    ADD COLUMN "isVehicleRepresentative" BOOLEAN NOT NULL DEFAULT true;

-- Representative = most recently synchronized active listing for the vehicle,
-- id as the deterministic tie-breaker (matches selectRepresentativeListings).
-- Only the non-representatives are flipped; the winners keep the column default.
UPDATE "ListingRecord" AS l
SET "isVehicleRepresentative" = false
WHERE l."status" = 'active'
  AND l."id" <> (
    SELECT r."id"
    FROM "ListingRecord" AS r
    WHERE r."vehicleId" = l."vehicleId"
      AND r."status" = 'active'
    ORDER BY r."synchronizedAt" DESC, r."id" ASC
    LIMIT 1
  );

-- Partial: only representatives are ever read through this path, and they are a
-- minority once multi-source overlap builds up.
CREATE INDEX "ListingRecord_isVehicleRepresentative_status_priceAmount_idx"
    ON "ListingRecord" ("isVehicleRepresentative", "status", "priceAmount");
