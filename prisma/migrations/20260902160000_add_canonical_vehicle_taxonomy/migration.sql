-- Canonical vehicle taxonomy: provenance columns + inferred dimensions +
-- a normalization version so historical rows can be reprocessed when rules
-- improve. Additive and nullable — no data is rewritten by the migration
-- itself; the backfill script populates these column by column.

ALTER TABLE "VehicleRecord"
ADD COLUMN "rawMake" TEXT,
ADD COLUMN "rawModel" TEXT,
ADD COLUMN "generation" TEXT,
ADD COLUMN "trim" TEXT,
ADD COLUMN "performanceVariant" TEXT,
ADD COLUMN "normalizationVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "VehicleRecord_make_model_bodyStyle_fuelType_idx"
ON "VehicleRecord"("make", "model", "bodyStyle", "fuelType");

CREATE INDEX "VehicleRecord_normalizationVersion_idx"
ON "VehicleRecord"("normalizationVersion");
