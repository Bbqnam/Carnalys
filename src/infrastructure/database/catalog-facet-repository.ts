import type { AvailableVehicleFilters } from "@/features/search/types";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

const activeCatalogSummaryId = "active-catalog";

export async function refreshCatalogFacets() {
  await initializeDatabase();
  const updatedAt = new Date();

  await prisma.$transaction(
    async (transaction) => {
      await transaction.catalogMakeFacet.deleteMany();
      await transaction.catalogModelFacet.deleteMany();
      await transaction.catalogYearFacet.deleteMany();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "CatalogMakeFacet" ("make", "count", "updatedAt")
        SELECT vehicle."make", COUNT(*), ${updatedAt}
        FROM "ListingRecord" AS listing
        INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
        WHERE listing."status" = 'active'
        GROUP BY vehicle."make"
      `);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "CatalogModelFacet" ("make", "model", "count", "updatedAt")
        SELECT vehicle."make", vehicle."model", COUNT(*), ${updatedAt}
        FROM "ListingRecord" AS listing
        INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
        WHERE listing."status" = 'active'
        GROUP BY vehicle."make", vehicle."model"
      `);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "CatalogYearFacet" ("modelYear", "count", "updatedAt")
        SELECT vehicle."modelYear", COUNT(*), ${updatedAt}
        FROM "ListingRecord" AS listing
        INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
        WHERE listing."status" = 'active'
        GROUP BY vehicle."modelYear"
      `);

      const summary = await transaction.listingRecord.aggregate({
        where: { status: "active" },
        _count: { id: true },
        _min: { priceAmount: true },
        _max: { priceAmount: true, synchronizedAt: true },
      });
      await transaction.catalogSummary.upsert({
        where: { id: activeCatalogSummaryId },
        create: {
          id: activeCatalogSummaryId,
          activeListingCount: summary._count.id,
          minimumPrice: summary._min.priceAmount ?? 0,
          maximumPrice: summary._max.priceAmount ?? 0,
          lastSynchronizedAt: summary._max.synchronizedAt,
          facetsUpdatedAt: updatedAt,
        },
        update: {
          activeListingCount: summary._count.id,
          minimumPrice: summary._min.priceAmount ?? 0,
          maximumPrice: summary._max.priceAmount ?? 0,
          lastSynchronizedAt: summary._max.synchronizedAt,
          facetsUpdatedAt: updatedAt,
        },
      });
    },
    { timeout: 30_000 },
  );
}

export async function getPreparedCatalogFilters(
  selectedBrands: readonly string[],
): Promise<{
  filters: AvailableVehicleFilters;
  lastSynchronizedAt?: string;
}> {
  await initializeDatabase();
  const [brands, modelGroups, years, summary] = await Promise.all([
    prisma.catalogMakeFacet.findMany({ orderBy: { make: "asc" } }),
    prisma.catalogModelFacet.groupBy({
      by: ["model"],
      where:
        selectedBrands.length > 0
          ? { make: { in: [...selectedBrands] } }
          : undefined,
      _sum: { count: true },
      orderBy: { model: "asc" },
    }),
    prisma.catalogYearFacet.findMany({ orderBy: { modelYear: "desc" } }),
    prisma.catalogSummary.findUnique({ where: { id: activeCatalogSummaryId } }),
  ]);

  return {
    filters: {
      brands: brands.map(({ make, count }) => ({ value: make, count })),
      models: modelGroups.map(({ model, _sum }) => ({
        value: model,
        count: _sum.count ?? 0,
      })),
      years: years.map(({ modelYear, count }) => ({ value: modelYear, count })),
      priceRange: {
        minimum: summary?.minimumPrice ?? 0,
        maximum: summary?.maximumPrice ?? 0,
      },
    },
    lastSynchronizedAt: summary?.lastSynchronizedAt?.toISOString(),
  };
}
