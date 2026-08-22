-- DropIndex
DROP INDEX "ListingRecord_sellerName_trgm_idx";

-- DropIndex
DROP INDEX "VehicleRecord_make_trgm_idx";

-- DropIndex
DROP INDEX "VehicleRecord_model_trgm_idx";

-- DropIndex
DROP INDEX "VehicleRecord_variant_trgm_idx";

-- AlterTable
ALTER TABLE "VehicleRecord" ADD COLUMN     "fuelConsumption" TEXT;
