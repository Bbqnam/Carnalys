import "server-only";

import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

export interface SourceValueMetric {
  provider: string;
  displayName: string;
  activeListings: number;
  activeVehicles: number;
  uniqueVehicles: number;
  uniqueRate: number;
  blocketOverlapVehicles: number;
  blocketOverlapRate: number | null;
  averageLeadHoursVsBlocket: number | null;
  registrationCoverage: number;
  descriptionCoverage: number;
  imageCoverage: number;
  equipmentCoverage: number;
  staleVehicles: number;
  staleRate: number;
  lastSynchronizedAt: Date | null;
}

export interface SourcePairOverlap {
  sourceA: string;
  sourceB: string;
  sharedVehicles: number;
  overlapOfSmallerSource: number;
}

interface SourceValueRow extends Omit<SourceValueMetric,
  | "uniqueRate"
  | "blocketOverlapRate"
  | "averageLeadHoursVsBlocket"
  | "registrationCoverage"
  | "descriptionCoverage"
  | "imageCoverage"
  | "equipmentCoverage"
  | "staleRate"
> {
  uniqueRate: number | null;
  blocketOverlapRate: number | null;
  averageLeadHoursVsBlocket: number | null;
  registrationCoverage: number | null;
  descriptionCoverage: number | null;
  imageCoverage: number | null;
  equipmentCoverage: number | null;
  staleRate: number | null;
}

interface PairRow extends Omit<SourcePairOverlap, "overlapOfSmallerSource"> {
  overlapOfSmallerSource: number | null;
}

export interface SourceValueReport {
  generatedAt: Date;
  staleAfterHours: number;
  sources: readonly SourceValueMetric[];
  overlaps: readonly SourcePairOverlap[];
}

async function loadSourceValueReport(now: Date): Promise<SourceValueReport> {
  await initializeDatabase();
  const staleAfterHours = 48;
  const staleCutoff = new Date(now.getTime() - staleAfterHours * 60 * 60 * 1_000);

  const perVehicle = Prisma.sql`
    WITH active_base AS MATERIALIZED (
      SELECT
        listing.provider,
        listing."vehicleId",
        listing.id,
        listing."firstSeenAt",
        listing."lastSeenAt",
        listing."synchronizedAt",
        NULLIF(BTRIM(COALESCE(listing.description, '')), '') IS NOT NULL AS "hasDescription",
        vehicle."registrationNumber" IS NOT NULL AS "hasRegistration"
      FROM "ListingRecord" listing
      JOIN "VehicleRecord" vehicle ON vehicle.id = listing."vehicleId"
      WHERE listing.status = 'active'
    ), image_listings AS (
      SELECT DISTINCT image."listingId"
      FROM "ListingImageRecord" image
      JOIN active_base ON active_base.id = image."listingId"
    ), equipment_listings AS (
      SELECT DISTINCT equipment."listingId"
      FROM "ListingEquipmentRecord" equipment
      JOIN active_base ON active_base.id = equipment."listingId"
    ), active AS (
      SELECT
        active_base.*,
        image_listings."listingId" IS NOT NULL AS "hasImages",
        equipment_listings."listingId" IS NOT NULL AS "hasEquipment"
      FROM active_base
      LEFT JOIN image_listings ON image_listings."listingId" = active_base.id
      LEFT JOIN equipment_listings ON equipment_listings."listingId" = active_base.id
    ), per_vehicle AS (
      SELECT
        provider,
        "vehicleId",
        MIN("firstSeenAt") AS "firstSeenAt",
        MAX("lastSeenAt") AS "lastSeenAt",
        MAX("synchronizedAt") AS "synchronizedAt",
        BOOL_OR("hasDescription") AS "hasDescription",
        BOOL_OR("hasRegistration") AS "hasRegistration",
        BOOL_OR("hasImages") AS "hasImages",
        BOOL_OR("hasEquipment") AS "hasEquipment"
      FROM active
      GROUP BY provider, "vehicleId"
    )
  `;

  const [rows, pairRows] = await Promise.all([
    prisma.$queryRaw<SourceValueRow[]>(Prisma.sql`
      ${perVehicle},
      source_counts AS (
        SELECT "vehicleId", COUNT(*)::int AS "sourceCount"
        FROM per_vehicle
        GROUP BY "vehicleId"
      ),
      blocket AS (
        SELECT "vehicleId", "firstSeenAt"
        FROM per_vehicle
        WHERE provider = 'blocket_unofficial'
      ),
      listing_counts AS (
        SELECT provider, COUNT(*)::int AS "activeListings"
        FROM active
        GROUP BY provider
      )
      SELECT
        source.provider,
        COALESCE(provider_registry."displayName", source.provider) AS "displayName",
        listing_counts."activeListings",
        COUNT(*)::int AS "activeVehicles",
        COUNT(*) FILTER (WHERE source_counts."sourceCount" = 1)::int AS "uniqueVehicles",
        COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE source_counts."sourceCount" = 1) / NULLIF(COUNT(*), 0), 1), 0)::float8 AS "uniqueRate",
        COUNT(*) FILTER (WHERE blocket."vehicleId" IS NOT NULL)::int AS "blocketOverlapVehicles",
        CASE WHEN source.provider = 'blocket_unofficial' THEN NULL ELSE
          COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE blocket."vehicleId" IS NOT NULL) / NULLIF(COUNT(*), 0), 1), 0)::float8
        END AS "blocketOverlapRate",
        CASE WHEN source.provider = 'blocket_unofficial' THEN NULL ELSE
          ROUND(AVG(EXTRACT(EPOCH FROM (blocket."firstSeenAt" - source."firstSeenAt")) / 3600.0)
            FILTER (WHERE blocket."vehicleId" IS NOT NULL))::float8
        END AS "averageLeadHoursVsBlocket",
        ROUND(100.0 * COUNT(*) FILTER (WHERE source."hasRegistration") / NULLIF(COUNT(*), 0), 1)::float8 AS "registrationCoverage",
        ROUND(100.0 * COUNT(*) FILTER (WHERE source."hasDescription") / NULLIF(COUNT(*), 0), 1)::float8 AS "descriptionCoverage",
        ROUND(100.0 * COUNT(*) FILTER (WHERE source."hasImages") / NULLIF(COUNT(*), 0), 1)::float8 AS "imageCoverage",
        ROUND(100.0 * COUNT(*) FILTER (WHERE source."hasEquipment") / NULLIF(COUNT(*), 0), 1)::float8 AS "equipmentCoverage",
        COUNT(*) FILTER (WHERE source."lastSeenAt" < ${staleCutoff})::int AS "staleVehicles",
        ROUND(100.0 * COUNT(*) FILTER (WHERE source."lastSeenAt" < ${staleCutoff}) / NULLIF(COUNT(*), 0), 1)::float8 AS "staleRate",
        MAX(source."synchronizedAt") AS "lastSynchronizedAt"
      FROM per_vehicle source
      JOIN source_counts USING ("vehicleId")
      LEFT JOIN blocket USING ("vehicleId")
      JOIN listing_counts USING (provider)
      LEFT JOIN "ListingProvider" provider_registry ON provider_registry.key = source.provider
      GROUP BY source.provider, provider_registry."displayName", listing_counts."activeListings"
      ORDER BY COUNT(*) DESC
    `),
    prisma.$queryRaw<PairRow[]>(Prisma.sql`
      WITH per_vehicle AS (
        SELECT DISTINCT provider, "vehicleId"
        FROM "ListingRecord"
        WHERE status = 'active'
      ),
      source_sizes AS (
        SELECT provider, COUNT(*)::int AS size
        FROM per_vehicle
        GROUP BY provider
      )
      SELECT
        left_source.provider AS "sourceA",
        right_source.provider AS "sourceB",
        COUNT(*)::int AS "sharedVehicles",
        ROUND(100.0 * COUNT(*) / NULLIF(LEAST(left_size.size, right_size.size), 0), 1)::float8 AS "overlapOfSmallerSource"
      FROM per_vehicle left_source
      JOIN per_vehicle right_source
        ON right_source."vehicleId" = left_source."vehicleId"
        AND right_source.provider > left_source.provider
      JOIN source_sizes left_size ON left_size.provider = left_source.provider
      JOIN source_sizes right_size ON right_size.provider = right_source.provider
      GROUP BY left_source.provider, right_source.provider, left_size.size, right_size.size
      ORDER BY COUNT(*) DESC
    `),
  ]);

  const number = (value: number | null) => Number(value ?? 0);
  return {
    generatedAt: now,
    staleAfterHours,
    sources: rows.map((row) => ({
      ...row,
      activeListings: Number(row.activeListings),
      activeVehicles: Number(row.activeVehicles),
      uniqueVehicles: Number(row.uniqueVehicles),
      uniqueRate: number(row.uniqueRate),
      blocketOverlapVehicles: Number(row.blocketOverlapVehicles),
      blocketOverlapRate: row.blocketOverlapRate === null ? null : Number(row.blocketOverlapRate),
      averageLeadHoursVsBlocket:
        row.averageLeadHoursVsBlocket === null ? null : Number(row.averageLeadHoursVsBlocket),
      registrationCoverage: number(row.registrationCoverage),
      descriptionCoverage: number(row.descriptionCoverage),
      imageCoverage: number(row.imageCoverage),
      equipmentCoverage: number(row.equipmentCoverage),
      staleVehicles: Number(row.staleVehicles),
      staleRate: number(row.staleRate),
    })),
    overlaps: pairRows.map((row) => ({
      sourceA: row.sourceA,
      sourceB: row.sourceB,
      sharedVehicles: Number(row.sharedVehicles),
      overlapOfSmallerSource: number(row.overlapOfSmallerSource),
    })),
  };
}

const getCachedSourceValueReport = unstable_cache(
  () => loadSourceValueReport(new Date()),
  ["source-value-report-v1"],
  { revalidate: 900 },
);

/** Expensive set-based inventory analysis, cached for the admin dashboard. */
export function getSourceValueReport(): Promise<SourceValueReport> {
  return getCachedSourceValueReport();
}
