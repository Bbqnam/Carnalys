import { createHash, randomUUID } from "node:crypto";
import type { NormalizedVehicleListing } from "@/application/ingestion/types";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
  ].filter((value): value is { vin: string } | { registrationNumber: string } => Boolean(value));

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

async function upsertNormalizedListing(
  transaction: Prisma.TransactionClient,
  normalized: NormalizedVehicleListing,
  synchronizedAt: Date,
) {
  const vehicleId = await resolveVehicleId(transaction, normalized);
  const listingId = stableId(
    "listing",
    `${normalized.source.provider}:${normalized.source.externalId}`,
  );
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
        description: listing.description,
        serviceHistory: listing.serviceHistory,
        status: "active",
        publishedAt: normalized.source.publishedAt,
        sourceUpdatedAt: normalized.source.updatedAt,
        firstSeenAt: synchronizedAt,
        lastSeenAt: synchronizedAt,
        synchronizedAt,
        rawPayload: normalized.rawPayload ? jsonValue(normalized.rawPayload) : undefined,
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
        description: listing.description,
        serviceHistory: listing.serviceHistory,
        status: "active",
        publishedAt: normalized.source.publishedAt,
        sourceUpdatedAt: normalized.source.updatedAt,
        lastSeenAt: synchronizedAt,
        synchronizedAt,
        removedAt: null,
        rawPayload: normalized.rawPayload ? jsonValue(normalized.rawPayload) : undefined,
      },
  });

  await transaction.listingImageRecord.deleteMany({ where: { listingId } });
  if (listing.images.length > 0) {
    await transaction.listingImageRecord.createMany({
      data: listing.images.map((image) => ({ ...image, listingId })),
    });
  }

  await transaction.listingEquipmentRecord.deleteMany({ where: { listingId } });
  if (listing.equipment.length > 0) {
    await transaction.listingEquipmentRecord.createMany({
      data: [...new Set(listing.equipment)].map((label) => ({ listingId, label })),
    });
  }
}

export function upsertNormalizedListings(
  listings: readonly NormalizedVehicleListing[],
  synchronizedAt: Date,
) {
  return prisma.$transaction(
    async (transaction) => {
      for (const listing of listings) {
        await upsertNormalizedListing(transaction, listing, synchronizedAt);
      }
    },
    { timeout: 60_000 },
  );
}

export async function beginImportRun(
  provider: string,
  sourceScope: string,
  startedAt: Date,
) {
  await prisma.importRun.updateMany({
    where: { provider, status: "running" },
    data: {
      status: "failed",
      completedAt: startedAt,
      errorMessage: "Importen avbröts innan den slutfördes.",
    },
  });

  return prisma.importRun.create({
    data: {
      id: randomUUID(),
      provider,
      sourceScope,
      status: "running",
      startedAt,
    },
  });
}

export async function markMissingListingsRemoved(
  provider: string,
  sourceScope: string,
  runStartedAt: Date,
) {
  const removedAt = new Date();
  const result = await prisma.listingRecord.updateMany({
    where: {
      provider,
      sourceScope,
      status: "active",
      lastSeenAt: { lt: runStartedAt },
    },
    data: { status: "removed", removedAt },
  });
  return result.count;
}

export function finishImportRun(
  id: string,
  result: {
    fetchedCount: number;
    importedCount: number;
    failedCount: number;
    removedCount: number;
  },
) {
  return prisma.importRun.update({
    where: { id },
    data: { ...result, status: "completed", completedAt: new Date() },
  });
}

export function failImportRun(id: string, error: unknown) {
  return prisma.importRun.update({
    where: { id },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : "Okänt importfel",
    },
  });
}
