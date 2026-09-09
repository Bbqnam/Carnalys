ALTER TABLE "ListingAnalysisRecord"
  ADD COLUMN "confidenceRank" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scoringVersion" TEXT NOT NULL DEFAULT 'legacy';

UPDATE "ListingAnalysisRecord"
SET "confidenceRank" = CASE "confidence"
  WHEN 'high' THEN 3
  WHEN 'medium' THEN 2
  WHEN 'low' THEN 1
  ELSE 0
END;

CREATE INDEX "ListingAnalysisRecord_confidenceRank_dealScore_idx"
  ON "ListingAnalysisRecord"("confidenceRank", "dealScore");
