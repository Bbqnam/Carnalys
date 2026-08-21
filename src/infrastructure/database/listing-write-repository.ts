import { createHash } from "node:crypto";
import type { NormalizedVehicleListing } from "@/application/ingestion/types";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function listingHashes(normalized: NormalizedVehicleListing) {
  const equipment = [...new Set(normalized.listing.equipment)].toSorted();
  return {
    contentHash: digest({
      source: normalized.source,
      vehicle: normalized.vehicle,
      listing: {
        sellerName: normalized.listing.sellerName,
        sellerType: normalized.listing.sellerType,
        priceAmount: normalized.listing.priceAmount,
        previousPriceAmount: normalized.listing.previousPriceAmount,
        monthlyCostAmount: normalized.listing.monthlyCostAmount,
        mileageKm: normalized.listing.mileageKm,
        location: normalized.listing.location,
        municipality: normalized.listing.municipality,
        latitude: normalized.listing.latitude,
        longitude: normalized.listing.longitude,
        description: normalized.listing.description,
        serviceHistory: normalized.listing.serviceHistory,
        ownerCount: normalized.listing.ownerCount,
      },
    }),
    imageHash: digest(normalized.listing.images),
    equipmentHash: digest(equipment),
    equipment,
  };
}

async function resolveVehicleId(
  database: Prisma.TransactionClient,
  listing: NormalizedVehicleListing,
) {
  const identifiers = [
    listing.vehicle.vin ? { vin: listing.vehicle.vin } : undefined,
    listing.vehicle.registrationNumber
      ? { registrationNumber: listing.vehicle.registrationNumber }
      : undefined,
  ].filter(
    (value): value is { vin: string } | { registrationNumber: string } =>
      Boolean(value),
  );

  if (identifiers.length > 0) {
    const existing = await database.vehicleRecord.findFirst({
      where: { OR: identifiers },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const identity =
    listing.vehicle.vin ??
    listing.vehicle.registrationNumber ??
    `${listing.source.provider}:${listing.source.externalId}`;
  return stableId("vehicle", identity);
}

function neutralAnalysis(priceAmount: number) {
  const roundedThousands = (value: number) =>
    Math.max(1_000, Math.round(value / 1_000) * 1_000);
  return {
    marketValueAmount: priceAmount,
    marketValueMinimum: roundedThousands(priceAmount * 0.9),
    marketValueMaximum: roundedThousands(priceAmount * 1.1),
    comparableCount: 0,
    confidence: "low",
    dealScore: 70,
    buyConfidenceScore: 70,
    annualOwnershipCost: Math.round(34_000 + priceAmount * 0.065),
    methodologyVersion: "stored-neutral-1.0",
  };
}

interface ExistingListingState {
  id: string;
  vehicleId: string;
  status: string;
  contentHash: string | null;
  imageHash: string | null;
  equipmentHash: string | null;
}

async function writeListing(
  transaction: Prisma.TransactionClient,
  normalized: NormalizedVehicleListing,
  synchronizedAt: Date,
  existing: ExistingListingState | undefined,
) {
  const hashes = listingHashes(normalized);
  const listingId =
    existing?.id ??
    stableId(
      "listing",
      `${normalized.source.provider}:${normalized.source.externalId}`,
    );
  const unchanged =
    existing?.status === "active" &&
    existing.contentHash === hashes.contentHash &&
    existing.imageHash === hashes.imageHash &&
    existing.equipmentHash === hashes.equipmentHash;

  if (unchanged) {
    await transaction.listingRecord.update({
      where: { id: listingId },
      data: {
        sourceScope: normalized.source.scope,
        lastSeenAt: synchronizedAt,
        synchronizedAt,
        missingReconciliationCount: 0,
      },
    });
    return { listingId, state: "unchanged" as const };
  }

  const vehicleId = await resolveVehicleId(transaction, normalized);
  const vehicle = normalized.vehicle;
  const listing = normalized.listing;

  await transaction.vehicleRecord.upsert({
    where: { id: vehicleId },
    create: {
      id: vehicleId,
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant,
      modelYear: vehicle.modelYear,
      registrationYear: vehicle.registrationYear,
      bodyStyle: vehicle.bodyStyle,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      drivetrain: vehicle.drivetrain,
      horsepower: vehicle.horsepower,
      engineDescription: vehicle.engineDescription,
      engineDisplacement: vehicle.engineDisplacementCc,
      firstRegistration: vehicle.firstRegistration,
    },
    update: {
      vin: vehicle.vin,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      variant: vehicle.variant,
      modelYear: vehicle.modelYear,
      registrationYear: vehicle.registrationYear,
      bodyStyle: vehicle.bodyStyle,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      drivetrain: vehicle.drivetrain,
      horsepower: vehicle.horsepower,
      engineDescription: vehicle.engineDescription,
      engineDisplacement: vehicle.engineDisplacementCc,
      firstRegistration: vehicle.firstRegistration,
    },
  });

  await transaction.listingRecord.upsert({
    where: {
      provider_externalId: {
        provider: normalized.source.provider,
        externalId: normalized.source.externalId,
      },
    },
    create: {
      id: listingId,
      provider: normalized.source.provider,
      sourceScope: normalized.source.scope,
      externalId: normalized.source.externalId,
      vehicleId,
      listingUrl: normalized.source.listingUrl,
      sellerName: listing.sellerName,
      sellerType: listing.sellerType,
      priceAmount: listing.priceAmount,
      previousPriceAmount: listing.previousPriceAmount,
      monthlyCostAmount: listing.monthlyCostAmount,
      mileageKm: listing.mileageKm,
      location: listing.location,
      municipality: listing.municipality,
      latitude: listing.latitude,
      longitude: listing.longitude,
      description: listing.description,
      serviceHistory: listing.serviceHistory,
      ownerCount: listing.ownerCount,
      status: "active",
      publishedAt: normalized.source.publishedAt,
      sourceUpdatedAt: normalized.source.updatedAt,
      firstSeenAt: synchronizedAt,
      lastSeenAt: synchronizedAt,
      synchronizedAt,
      rawPayload: normalized.rawPayload
        ? jsonValue(normalized.rawPayload)
        : undefined,
      contentHash: hashes.contentHash,
      imageHash: hashes.imageHash,
      equipmentHash: hashes.equipmentHash,
    },
    update: {
      sourceScope: normalized.source.scope,
      vehicleId,
      listingUrl: normalized.source.listingUrl,
      sellerName: listing.sellerName,
      sellerType: listing.sellerType,
      priceAmount: listing.priceAmount,
      previousPriceAmount: listing.previousPriceAmount,
      monthlyCostAmount: listing.monthlyCostAmount,
      mileageKm: listing.mileageKm,
      location: listing.location,
      municipality: listing.municipality,
      latitude: listing.latitude,
      longitude: listing.longitude,
      description: listing.description,
      serviceHistory: listing.serviceHistory,
      ownerCount: listing.ownerCount,
      status: "active",
      publishedAt: normalized.source.publishedAt,
      sourceUpdatedAt: normalized.source.updatedAt,
      lastSeenAt: synchronizedAt,
      synchronizedAt,
      removedAt: null,
      missingReconciliationCount: 0,
      rawPayload: normalized.rawPayload
        ? jsonValue(normalized.rawPayload)
        : undefined,
      contentHash: hashes.contentHash,
      imageHash: hashes.imageHash,
      equipmentHash: hashes.equipmentHash,
    },
  });

  if (!existing || existing.imageHash !== hashes.imageHash) {
    await transaction.listingImageRecord.deleteMany({ where: { listingId } });
    if (listing.images.length > 0) {
      await transaction.listingImageRecord.createMany({
        data: listing.images.map((image) => ({ ...image, listingId })),
      });
    }
  }

  if (!existing || existing.equipmentHash !== hashes.equipmentHash) {
    await transaction.listingEquipmentRecord.deleteMany({ where: { listingId } });
    if (hashes.equipment.length > 0) {
      await transaction.listingEquipmentRecord.createMany({
        data: hashes.equipment.map((label) => ({ listingId, label })),
      });
    }
  }

  await transaction.listingAnalysisRecord.upsert({
    where: { listingId },
    create: {
      listingId,
      ...neutralAnalysis(listing.priceAmount),
      calculatedAt: synchronizedAt,
      sourceSynchronizedAt: synchronizedAt,
    },
    update: {
      ...neutralAnalysis(listing.priceAmount),
      calculatedAt: synchronizedAt,
      sourceSynchronizedAt: synchronizedAt,
    },
  });

  return { listingId, state: existing ? ("updated" as const) : ("created" as const) };
}

export interface ListingWriteResult {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  changedListingIds: readonly string[];
}

export async function upsertNormalizedListings(
  listings: readonly NormalizedVehicleListing[],
  synchronizedAt: Date,
): Promise<ListingWriteResult> {
  await initializeDatabase();
  if (listings.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedListingIds: [],
    };
  }

  return prisma.$transaction(
    async (transaction) => {
      const providers = [...new Set(listings.map(({ source }) => source.provider))];
      const externalIds = listings.map(({ source }) => source.externalId);
      const existingRows = await transaction.listingRecord.findMany({
        where: {
          provider: { in: providers },
          externalId: { in: externalIds },
        },
        select: {
          id: true,
          provider: true,
          externalId: true,
          vehicleId: true,
          status: true,
          contentHash: true,
          imageHash: true,
          equipmentHash: true,
        },
      });
      const existingBySource = new Map(
        existingRows.map((row) => [`${row.provider}:${row.externalId}`, row]),
      );
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      const changedListingIds: string[] = [];

      for (const listing of listings) {
        const result = await writeListing(
          transaction,
          listing,
          synchronizedAt,
          existingBySource.get(
            `${listing.source.provider}:${listing.source.externalId}`,
          ),
        );
        if (result.state === "created") createdCount += 1;
        if (result.state === "updated") updatedCount += 1;
        if (result.state === "unchanged") unchangedCount += 1;
        if (result.state !== "unchanged") changedListingIds.push(result.listingId);
      }

      return {
        createdCount,
        updatedCount,
        unchangedCount,
        changedListingIds,
      };
    },
    { timeout: 30_000 },
  );
}

export async function existingListingExternalIds(
  provider: string,
  externalIds: readonly string[],
) {
  if (externalIds.length === 0) return new Set<string>();
  const rows = await prisma.listingRecord.findMany({
    where: { provider, externalId: { in: [...externalIds] } },
    select: { externalId: true },
  });
  return new Set(rows.map(({ externalId }) => externalId));
}

/**
 * Cached raw detail payloads for listings we've already enriched before,
 * keyed by externalId. Lets a sync re-normalize a known, already-enriched
 * listing from its stored raw JSON instead of re-fetching detail over the
 * network for every listing on every page — the network fetch only happens
 * for genuinely new listings, or known ones never successfully enriched.
 */
export async function existingListingDetailPayloads(
  provider: string,
  externalIds: readonly string[],
) {
  if (externalIds.length === 0) return new Map<string, unknown>();
  const rows = await prisma.listingRecord.findMany({
    where: { provider, externalId: { in: [...externalIds] } },
    select: { externalId: true, rawPayload: true },
  });
  const detailByExternalId = new Map<string, unknown>();
  for (const row of rows) {
    const rawPayload = row.rawPayload as { detail?: unknown } | null;
    if (rawPayload?.detail) detailByExternalId.set(row.externalId, rawPayload.detail);
  }
  return detailByExternalId;
}

export async function markMissingListingsRemovedSafely(
  provider: string,
  sourceScope: string,
  runId: string,
  runStartedAt: Date,
) {
  const removedAt = new Date();
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.importRun.findUniqueOrThrow({
      where: { id: runId },
      select: { cleanupAppliedAt: true, removedCount: true },
    });
    if (run.cleanupAppliedAt) return run.removedCount;

    await transaction.listingRecord.updateMany({
      where: {
        provider,
        sourceScope,
        status: "active",
        lastSeenAt: { lt: runStartedAt },
      },
      data: { missingReconciliationCount: { increment: 1 } },
    });
    const result = await transaction.listingRecord.updateMany({
      where: {
        provider,
        sourceScope,
        status: "active",
        lastSeenAt: { lt: runStartedAt },
        missingReconciliationCount: { gte: 2 },
      },
      data: { status: "removed", removedAt },
    });
    await transaction.importRun.update({
      where: { id: runId },
      data: {
        cleanupAppliedAt: removedAt,
        removedCount: result.count,
      },
    });
    return result.count;
  });
}
