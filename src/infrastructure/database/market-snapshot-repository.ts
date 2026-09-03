import {
  MARKET_COHORT_MINIMUM_SIZE,
  MARKET_NORMALIZATION_VERSION,
  addUtcDays,
  startOfUtcDay,
} from "@/domain/market/historical-market";
import { plausibleAskingPriceSql } from "@/domain/vehicle/pricing";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

export interface MarketSnapshotBuildResult {
  snapshotDate: Date;
  sourceWatermark: Date;
  cohortCount: number;
  minimumCohortSize: number;
}

/**
 * Builds one completed UTC day's derived market aggregates from the permanent
 * sparse event log. Re-running a date replaces only that date's derived rows;
 * ListingObservation is never updated or deleted.
 */
export async function buildMarketSnapshotsForDate(
  requestedDate: Date,
  minimumCohortSize = MARKET_COHORT_MINIMUM_SIZE,
): Promise<MarketSnapshotBuildResult> {
  if (!Number.isInteger(minimumCohortSize) || minimumCohortSize < 2) {
    throw new Error("minimumCohortSize must be an integer of at least 2.");
  }

  await initializeDatabase();
  const snapshotDate = startOfUtcDay(requestedDate);
  const dayEnd = addUtcDays(snapshotDate, 1);
  if (dayEnd > startOfUtcDay(new Date())) {
    throw new Error("Market snapshots can only be built for completed UTC dates.");
  }
  const analysisYear = snapshotDate.getUTCFullYear();
  const plausiblePrice = Prisma.raw(
    plausibleAskingPriceSql(
      'state."priceAmount"',
      'vehicle."modelYear"',
      analysisYear,
    ),
  );

  return prisma.$transaction(
    async (transaction) => {
      // Serializes cron/manual rebuilds without another durable lock table.
      // The lock is released automatically on commit or rollback.
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('carnalys_market_snapshot'))
      `;
      await transaction.$executeRaw`
        CREATE TEMPORARY TABLE "market_snapshot_stage" ON COMMIT DROP AS
        WITH effective_observations AS (
          SELECT
            observation.*,
            CASE
              WHEN observation."provenance" = 'reconstructed'
                THEN observation."createdAt"
              ELSE observation."observedAt"
            END AS "effectiveAt"
          FROM "ListingObservation" AS observation
          WHERE CASE
            WHEN observation."provenance" = 'reconstructed'
              THEN observation."createdAt"
            ELSE observation."observedAt"
          END < ${dayEnd}
        ),
        state AS (
          SELECT DISTINCT ON (observation."listingId")
            observation."listingId",
            observation."effectiveAt" AS "stateObservedAt",
            observation."priceAmount",
            observation."mileageKm",
            observation."status"
          FROM effective_observations AS observation
          ORDER BY
            observation."listingId",
            observation."effectiveAt" DESC,
            observation."id" DESC
        ),
        active_spells AS (
          SELECT
            observation."listingId",
            MAX(observation."observedAt") FILTER (
              WHERE observation."kind" IN ('first_seen', 'relisted')
            ) AS "activeSince"
          FROM effective_observations AS observation
          GROUP BY observation."listingId"
        ),
        active_candidates AS (
          SELECT
            listing."id" AS "listingId",
            listing."vehicleId",
            state."stateObservedAt",
            state."priceAmount",
            state."mileageKm",
            vehicle."make",
            vehicle."model",
            vehicle."fuelType",
            vehicle."transmission",
            vehicle."modelYear",
            CASE
              WHEN state."mileageKm" < 25000 THEN 0
              WHEN state."mileageKm" < 50000 THEN 1
              WHEN state."mileageKm" < 75000 THEN 2
              WHEN state."mileageKm" < 100000 THEN 3
              WHEN state."mileageKm" < 150000 THEN 4
              ELSE 5
            END AS "mileageBucket",
            GREATEST(
              0,
              EXTRACT(EPOCH FROM (
                ${dayEnd}::timestamp - COALESCE(
                  active_spells."activeSince",
                  listing."listedAt",
                  listing."firstSeenAt"
                )
              )) / 86400.0
            )::float8 AS "daysOnMarket",
            analysis."dealScore"::float8 AS "dealScore",
            analysis."marketValueAmount"
          FROM state
          INNER JOIN "ListingRecord" AS listing
            ON listing."id" = state."listingId"
          INNER JOIN "VehicleRecord" AS vehicle
            ON vehicle."id" = listing."vehicleId"
          LEFT JOIN active_spells
            ON active_spells."listingId" = listing."id"
          LEFT JOIN "ListingAnalysisRecord" AS analysis
            ON analysis."listingId" = listing."id"
           AND analysis."calculatedAt" < ${dayEnd}
           AND analysis."sourceSynchronizedAt" < ${dayEnd}
          WHERE state."status" = 'active'
            AND state."mileageKm" BETWEEN 0 AND 1000000
            AND ${plausiblePrice}
        ),
        active AS (
          SELECT DISTINCT ON (candidate."vehicleId") candidate.*
          FROM active_candidates AS candidate
          ORDER BY
            candidate."vehicleId",
            candidate."stateObservedAt" DESC,
            candidate."listingId" ASC
        ),
        active_groups AS (
          SELECT
            CASE
              WHEN GROUPING("mileageBucket") = 0 THEN 'mileage'
              WHEN GROUPING("modelYear") = 0 THEN 'model_year'
              WHEN GROUPING("transmission") = 0 THEN 'transmission'
              WHEN GROUPING("fuelType") = 0 THEN 'fuel'
              ELSE 'model'
            END AS "granularity",
            "make",
            "model",
            CASE WHEN GROUPING("fuelType") = 0 THEN "fuelType" END AS "fuelType",
            CASE WHEN GROUPING("transmission") = 0 THEN "transmission" END AS "transmission",
            CASE WHEN GROUPING("modelYear") = 0 THEN "modelYear" END AS "modelYear",
            CASE WHEN GROUPING("mileageBucket") = 0 THEN "mileageBucket" END AS "mileageBucket",
            COUNT(*)::int AS "activeListingCount",
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceAmount"))::int AS "medianPriceAmount",
            ROUND(AVG("priceAmount"))::int AS "averagePriceAmount",
            MIN("priceAmount")::int AS "minimumPriceAmount",
            MAX("priceAmount")::int AS "maximumPriceAmount",
            ROUND(percentile_cont(0.1) WITHIN GROUP (ORDER BY "priceAmount"))::int AS "priceP10Amount",
            ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY "priceAmount"))::int AS "priceP25Amount",
            ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY "priceAmount"))::int AS "priceP75Amount",
            ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY "priceAmount"))::int AS "priceP90Amount",
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY "mileageKm"))::int AS "medianMileageKm",
            ROUND(AVG("mileageKm"))::int AS "averageMileageKm",
            percentile_cont(0.5) WITHIN GROUP (ORDER BY "daysOnMarket")::float8 AS "medianDaysOnMarket",
            AVG("daysOnMarket")::float8 AS "averageDaysOnMarket",
            percentile_cont(0.5) WITHIN GROUP (ORDER BY "dealScore")
              FILTER (WHERE "dealScore" IS NOT NULL)::float8 AS "medianDealScore",
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY "marketValueAmount")
              FILTER (WHERE "marketValueAmount" IS NOT NULL))::int AS "medianMarketValueAmount"
          FROM active
          GROUP BY GROUPING SETS (
            ("make", "model"),
            ("make", "model", "fuelType"),
            ("make", "model", "fuelType", "transmission"),
            ("make", "model", "fuelType", "transmission", "modelYear"),
            ("make", "model", "fuelType", "transmission", "modelYear", "mileageBucket")
          )
          HAVING COUNT(*) >= ${minimumCohortSize}
        ),
        daily_events AS (
          SELECT
            observation."listingId",
            observation."kind",
            observation."priceAmount",
            observation."previousPriceAmount",
            vehicle."make",
            vehicle."model",
            vehicle."fuelType",
            vehicle."transmission",
            vehicle."modelYear",
            CASE
              WHEN observation."mileageKm" < 25000 THEN 0
              WHEN observation."mileageKm" < 50000 THEN 1
              WHEN observation."mileageKm" < 75000 THEN 2
              WHEN observation."mileageKm" < 100000 THEN 3
              WHEN observation."mileageKm" < 150000 THEN 4
              ELSE 5
            END AS "mileageBucket"
          FROM "ListingObservation" AS observation
          INNER JOIN "ListingRecord" AS listing
            ON listing."id" = observation."listingId"
          INNER JOIN "VehicleRecord" AS vehicle
            ON vehicle."id" = listing."vehicleId"
          WHERE observation."provenance" = 'observed'
            AND observation."observedAt" >= ${snapshotDate}
            AND observation."observedAt" < ${dayEnd}
        ),
        event_groups AS (
          SELECT
            CASE
              WHEN GROUPING("mileageBucket") = 0 THEN 'mileage'
              WHEN GROUPING("modelYear") = 0 THEN 'model_year'
              WHEN GROUPING("transmission") = 0 THEN 'transmission'
              WHEN GROUPING("fuelType") = 0 THEN 'fuel'
              ELSE 'model'
            END AS "granularity",
            "make",
            "model",
            CASE WHEN GROUPING("fuelType") = 0 THEN "fuelType" END AS "fuelType",
            CASE WHEN GROUPING("transmission") = 0 THEN "transmission" END AS "transmission",
            CASE WHEN GROUPING("modelYear") = 0 THEN "modelYear" END AS "modelYear",
            CASE WHEN GROUPING("mileageBucket") = 0 THEN "mileageBucket" END AS "mileageBucket",
            COUNT(*) FILTER (WHERE "kind" = 'first_seen')::int AS "newListingCount",
            COUNT(*) FILTER (WHERE "kind" = 'relisted')::int AS "reactivatedListingCount",
            COUNT(*) FILTER (WHERE "kind" = 'disappeared')::int AS "removedListingCount",
            COUNT(*) FILTER (
              WHERE "kind" = 'price_change'
                AND "previousPriceAmount" IS NOT NULL
                AND "priceAmount" < "previousPriceAmount"
            )::int AS "priceReductionCount",
            COUNT(DISTINCT "listingId") FILTER (
              WHERE "kind" = 'price_change'
                AND "previousPriceAmount" IS NOT NULL
                AND "priceAmount" < "previousPriceAmount"
            )::int AS "priceReductionListingCount",
            ROUND(percentile_cont(0.5) WITHIN GROUP (
              ORDER BY "previousPriceAmount" - "priceAmount"
            ) FILTER (
              WHERE "kind" = 'price_change'
                AND "previousPriceAmount" IS NOT NULL
                AND "priceAmount" < "previousPriceAmount"
            ))::int AS "medianPriceReductionAmount",
            ROUND(AVG("previousPriceAmount" - "priceAmount") FILTER (
              WHERE "kind" = 'price_change'
                AND "previousPriceAmount" IS NOT NULL
                AND "priceAmount" < "previousPriceAmount"
            ))::int AS "averagePriceReductionAmount"
          FROM daily_events
          GROUP BY GROUPING SETS (
            ("make", "model"),
            ("make", "model", "fuelType"),
            ("make", "model", "fuelType", "transmission"),
            ("make", "model", "fuelType", "transmission", "modelYear"),
            ("make", "model", "fuelType", "transmission", "modelYear", "mileageBucket")
          )
        ),
        watermark AS (
          SELECT COALESCE(MAX("effectiveAt"), ${snapshotDate}) AS "sourceWatermark"
          FROM effective_observations
        )
        SELECT
          md5(jsonb_build_array(
            ${MARKET_NORMALIZATION_VERSION}::text,
            active_groups."granularity",
            active_groups."make",
            active_groups."model",
            active_groups."fuelType",
            active_groups."transmission",
            active_groups."modelYear",
            active_groups."mileageBucket"
          )::text) AS "cohortKey",
          active_groups.*,
          ${MARKET_NORMALIZATION_VERSION}::text AS "normalizationVersion",
          ${snapshotDate}::date AS "snapshotDate",
          watermark."sourceWatermark",
          COALESCE(event_groups."newListingCount", 0)::int AS "newListingCount",
          COALESCE(event_groups."reactivatedListingCount", 0)::int AS "reactivatedListingCount",
          COALESCE(event_groups."removedListingCount", 0)::int AS "removedListingCount",
          COALESCE(event_groups."priceReductionCount", 0)::int AS "priceReductionCount",
          COALESCE(event_groups."priceReductionListingCount", 0)::int AS "priceReductionListingCount",
          event_groups."medianPriceReductionAmount",
          event_groups."averagePriceReductionAmount",
          COALESCE(
            event_groups."priceReductionListingCount"::float8 /
              NULLIF(active_groups."activeListingCount", 0),
            0
          )::float8 AS "priceReductionShare"
        FROM active_groups
        CROSS JOIN watermark
        LEFT JOIN event_groups
          ON event_groups."granularity" = active_groups."granularity"
         AND event_groups."make" = active_groups."make"
         AND event_groups."model" = active_groups."model"
         AND event_groups."fuelType" IS NOT DISTINCT FROM active_groups."fuelType"
         AND event_groups."transmission" IS NOT DISTINCT FROM active_groups."transmission"
         AND event_groups."modelYear" IS NOT DISTINCT FROM active_groups."modelYear"
         AND event_groups."mileageBucket" IS NOT DISTINCT FROM active_groups."mileageBucket"
      `;

      await transaction.$executeRaw`
        INSERT INTO "MarketCohort" (
          "cohortKey", "granularity", "make", "model", "fuelType",
          "transmission", "modelYear", "mileageBucket",
          "normalizationVersion", "createdAt", "updatedAt"
        )
        SELECT DISTINCT
          "cohortKey", "granularity", "make", "model", "fuelType",
          "transmission", "modelYear", "mileageBucket",
          "normalizationVersion", NOW(), NOW()
        FROM "market_snapshot_stage"
        ON CONFLICT ("cohortKey") DO NOTHING
      `;

      // Rebuilding one date is an atomic replacement of derived data only.
      await transaction.$executeRaw`
        DELETE FROM "MarketSnapshot" AS snapshot
        USING "MarketCohort" AS cohort
        WHERE snapshot."cohortId" = cohort."id"
          AND snapshot."snapshotDate" = ${snapshotDate}::date
          AND cohort."normalizationVersion" = ${MARKET_NORMALIZATION_VERSION}
      `;

      await transaction.$executeRaw`
        INSERT INTO "MarketSnapshot" (
          "cohortId", "snapshotDate", "sourceWatermark",
          "activeListingCount", "medianPriceAmount", "averagePriceAmount",
          "minimumPriceAmount", "maximumPriceAmount", "priceP10Amount",
          "priceP25Amount", "priceP75Amount", "priceP90Amount",
          "medianMileageKm", "averageMileageKm", "medianDaysOnMarket",
          "averageDaysOnMarket", "newListingCount", "reactivatedListingCount",
          "removedListingCount", "priceReductionCount",
          "priceReductionListingCount", "medianPriceReductionAmount",
          "averagePriceReductionAmount", "priceReductionShare",
          "medianDealScore", "medianMarketValueAmount", "generatedAt"
        )
        SELECT
          cohort."id", stage."snapshotDate", stage."sourceWatermark",
          stage."activeListingCount", stage."medianPriceAmount", stage."averagePriceAmount",
          stage."minimumPriceAmount", stage."maximumPriceAmount", stage."priceP10Amount",
          stage."priceP25Amount", stage."priceP75Amount", stage."priceP90Amount",
          stage."medianMileageKm", stage."averageMileageKm", stage."medianDaysOnMarket",
          stage."averageDaysOnMarket", stage."newListingCount", stage."reactivatedListingCount",
          stage."removedListingCount", stage."priceReductionCount",
          stage."priceReductionListingCount", stage."medianPriceReductionAmount",
          stage."averagePriceReductionAmount", stage."priceReductionShare",
          stage."medianDealScore", stage."medianMarketValueAmount", NOW()
        FROM "market_snapshot_stage" AS stage
        INNER JOIN "MarketCohort" AS cohort
          ON cohort."cohortKey" = stage."cohortKey"
      `;

      const [summary] = await transaction.$queryRaw<
        { cohortCount: number; sourceWatermark: Date }[]
      >`
        SELECT
          COUNT(*)::int AS "cohortCount",
          MAX("sourceWatermark") AS "sourceWatermark"
        FROM "market_snapshot_stage"
      `;
      return {
        snapshotDate,
        sourceWatermark: summary?.sourceWatermark ?? snapshotDate,
        cohortCount: summary?.cohortCount ?? 0,
        minimumCohortSize,
      };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}
