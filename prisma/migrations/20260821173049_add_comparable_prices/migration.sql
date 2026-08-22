-- AlterTable
ALTER TABLE "ListingAnalysisRecord" ADD COLUMN     "comparablePrices" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
