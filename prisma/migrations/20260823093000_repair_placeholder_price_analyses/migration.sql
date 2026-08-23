-- Repairs stored Deal Scores for listings whose advertised price is not the
-- price of the car.
--
-- Roughly 5% of the catalogue advertises a leasing rate or a "call for price"
-- placeholder — a 2026 BMW iX1 at 4,995 SEK. Those were compared against a
-- real market value of 535,000 SEK and scored a perfect Deal Score at *high*
-- confidence. 7,042 of the 7,879 listings scoring 90 or above were this one
-- bug: sorting by "Best Deal Score" showed almost nothing but placeholder ads.
--
-- The code fix (see listing-analysis-repository.ts, methodology
-- value-quality-composite-8.1) withholds the score whenever the asking price
-- is unusable, but stored analyses are only recomputed a few hundred at a time
-- by the nightly sync, so the catalogue would carry the bad scores for months.
-- This repairs them in one statement at deploy time. The market value itself
-- is left alone — it comes from comparables and is sound; only the price
-- verdict was wrong.
--
-- The floor must stay in step with `minimumPlausibleAskingPrice` in
-- src/domain/vehicle/pricing.ts.
UPDATE "ListingAnalysisRecord" AS analysis
SET
    "dealScore" = 50,
    "confidence" = 'low'
FROM "ListingRecord" AS listing
INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
WHERE analysis."listingId" = listing."id"
  AND (
        -- Age-relative floor: catches the 1 SEK placeholders.
        listing."priceAmount" < GREATEST(
          3000,
          25000 - 2000 * (EXTRACT(YEAR FROM NOW())::int - vehicle."modelYear")
        )
        -- Relative to the car's own comparables: catches the ones that clear
        -- any sane floor yet are still nowhere near the price of the car, such
        -- as a 2026 Audi RS Q8 advertised at 32,995 against a 1,507,000 market
        -- value. 0.35 keeps genuine bargains and damaged cars, which do reach
        -- 30-40% under market.
        OR (
          analysis."comparableCount" >= 3
          AND listing."priceAmount" < analysis."marketValueAmount" * 0.35
        )
      );
