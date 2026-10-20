-- Sortable market discount. Basis points preserve useful precision without a
-- floating-point ordering column: 1_250 means 12.50% below estimated value.
ALTER TABLE "ListingAnalysisRecord"
ADD COLUMN "marketDiscountBps" INTEGER;

UPDATE "ListingAnalysisRecord" AS analysis
SET "marketDiscountBps" = CASE
  WHEN analysis."comparableCount" >= 3
    AND analysis."dealScore" IS NOT NULL
    AND analysis."marketValueAmount" > 0
  THEN ROUND(
    ((analysis."marketValueAmount" - listing."priceAmount")::numeric
      / analysis."marketValueAmount") * 10000
  )::integer
  ELSE NULL
END
FROM "ListingRecord" AS listing
WHERE listing.id = analysis."listingId";

CREATE INDEX "ListingAnalysisRecord_marketDiscountBps_idx"
ON "ListingAnalysisRecord"("marketDiscountBps");

-- Evidence-backed reliability profiles. Profiles without a ReliabilitySource
-- remain admin drafts and are intentionally not shown on vehicle pages.
CREATE TABLE "ReliabilityProfile" (
  "id" TEXT NOT NULL,
  "make" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "generation" TEXT,
  "modelYearFrom" INTEGER NOT NULL,
  "modelYearTo" INTEGER NOT NULL,
  "fuelType" TEXT,
  "transmission" TEXT,
  "enginePattern" TEXT,
  "riskLevel" TEXT NOT NULL,
  "confidence" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReliabilityProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReliabilityIssue" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "symptoms" TEXT,
  "inspectionAdvice" TEXT,
  "typicalRepairCostMinimum" INTEGER,
  "typicalRepairCostMaximum" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReliabilityIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReliabilitySource" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReliabilitySource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReliabilityProfile_make_model_modelYearFrom_modelYearTo_idx"
ON "ReliabilityProfile"("make", "model", "modelYearFrom", "modelYearTo");

CREATE INDEX "ReliabilityIssue_profileId_severity_idx"
ON "ReliabilityIssue"("profileId", "severity");

CREATE UNIQUE INDEX "ReliabilitySource_profileId_url_key"
ON "ReliabilitySource"("profileId", "url");

CREATE INDEX "ReliabilitySource_profileId_idx"
ON "ReliabilitySource"("profileId");

ALTER TABLE "ReliabilityIssue"
ADD CONSTRAINT "ReliabilityIssue_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "ReliabilityProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReliabilitySource"
ADD CONSTRAINT "ReliabilitySource_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "ReliabilityProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
