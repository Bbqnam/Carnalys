-- The catalogue now reads the ordered IDs from ListingAnalysisRecord first,
-- then fetches only the forty full listing cards it needs. These indexes match
-- those ordered ID scans and avoid sorting the complete analysis table.
CREATE INDEX "ListingAnalysisRecord_catalogDealSort_idx"
ON "ListingAnalysisRecord" ("confidenceRank" DESC, "dealScore" DESC, "listingId" ASC);

CREATE INDEX "ListingAnalysisRecord_catalogDiscountSort_idx"
ON "ListingAnalysisRecord" ("marketDiscountBps" DESC, "valuationConfidenceScore" DESC, "listingId" ASC);

CREATE INDEX "ListingAnalysisRecord_catalogBuyConfidenceSort_idx"
ON "ListingAnalysisRecord" ("buyConfidenceScore" DESC, "listingId" ASC);
