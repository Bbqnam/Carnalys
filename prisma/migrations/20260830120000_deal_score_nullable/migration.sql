-- Deal Score is nullable: NULL means "unrated" (no comparable market value,
-- or the asking price was quarantined as a monthly rate / deposit / placeholder
-- / typo). A missing score must never be rendered or sorted as 50.
ALTER TABLE "ListingAnalysisRecord" ALTER COLUMN "dealScore" DROP NOT NULL;
