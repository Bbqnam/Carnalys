import "dotenv/config";

/**
 * Revalidate stored active listings with the same pure quality gate ingestion
 * uses. Dry-run by default; pass --write to persist. No listing, observation,
 * image, or historical row is deleted.
 */
import { assessListingDataQuality } from "@/domain/vehicle/analysis/listing-data-quality";
import { classifyPowertrain } from "@/domain/vehicle/taxonomy";
import type { BodyStyle, Drivetrain, FuelType, TransmissionType } from "@/domain/vehicle";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");
const QUARANTINE_ONLY = process.argv.includes("--quarantine-only");
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const LIMIT = limitArgument ? Number(limitArgument.split("=")[1]) : Number.MAX_SAFE_INTEGER;
const BATCH = 500;

async function main() {
  await initializeDatabase();
  const now = new Date();
  const counts = { scanned: 0, valid: 0, warning: 0, rejected: 0 };
  const reasons = new Map<string, number>();
  let cursor: string | undefined;

  while (counts.scanned < LIMIT) {
    const rows = await prisma.listingRecord.findMany({
      where: {
        status: "active",
        ...(ALL ? {} : { validationStatus: "unchecked" }),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: Math.min(BATCH, LIMIT - counts.scanned),
      select: {
        id: true,
        title: true,
        description: true,
        priceAmount: true,
        monthlyCostAmount: true,
        mileageKm: true,
        sellerType: true,
        sellerName: true,
        isVehicleRepresentative: true,
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            variant: true,
            modelYear: true,
            fuelType: true,
            bodyStyle: true,
            transmission: true,
            drivetrain: true,
            horsepower: true,
            generation: true,
          },
        },
      },
    });
    if (rows.length === 0) break;
    cursor = rows.at(-1)!.id;

    const updates = rows.map((row) => {
      const text = `${row.title ?? ""} ${row.vehicle.variant ?? ""} ${row.description ?? ""}`;
      const powertrain = classifyPowertrain({
        fuelType: row.vehicle.fuelType as FuelType,
        text,
      });
      const quality = assessListingDataQuality({
        priceAmount: row.priceAmount,
        monthlyCostAmount: row.monthlyCostAmount,
        mileageKm: row.mileageKm,
        modelYear: row.vehicle.modelYear,
        make: row.vehicle.make,
        model: row.vehicle.model,
        title: row.title,
        variant: row.vehicle.variant,
        description: row.description,
        fuelType: row.vehicle.fuelType as FuelType,
        powertrainType: powertrain.type,
        powertrainConflict: powertrain.conflict,
        bodyStyle: row.vehicle.bodyStyle as BodyStyle,
        transmission: row.vehicle.transmission as TransmissionType,
        drivetrain: row.vehicle.drivetrain as Drivetrain | null,
        horsepower: row.vehicle.horsepower,
        generation: row.vehicle.generation,
        sellerType: row.sellerType === "private" ? "private" : "dealer",
        sellerName: row.sellerName,
        currentYear: now.getUTCFullYear(),
      });

      counts.scanned += 1;
      counts[quality.status] += 1;
      quality.reasonCodes.forEach((reason) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1));

      if (!WRITE || (QUARANTINE_ONLY && quality.valuationEligible)) return null;
      return () =>
        prisma.$transaction([
          prisma.listingRecord.update({
            where: { id: row.id },
            data: {
              validationStatus: quality.status,
              validationReasonCodes: [...quality.reasonCodes],
              valuationEligible: quality.valuationEligible,
              validatedAt: now,
            },
          }),
          ...(row.isVehicleRepresentative
            ? [
                prisma.vehicleRecord.update({
                  where: { id: row.vehicle.id },
                  data: { powertrainType: powertrain.type },
                }),
              ]
            : []),
          ...(!quality.valuationEligible
            ? [
                prisma.listingAnalysisRecord.updateMany({
                  where: { listingId: row.id },
                  data: {
                    comparableCount: 0,
                    comparablePrices: [],
                    confidence: "unrated",
                    confidenceRank: 0,
                    valuationConfidenceScore: null,
                    valuationConfidenceLabel: null,
                    comparableInsights: [],
                    dealScore: null,
                    methodologyVersion: "quality-quarantine-12.1",
                    calculatedAt: now,
                  },
                }),
              ]
            : []),
        ]);
    });
    if (WRITE) {
      const work = updates.filter((update): update is NonNullable<typeof update> => Boolean(update));
      let next = 0;
      const lane = async () => {
        while (next < work.length) {
          const update = work[next++];
          await update();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, work.length) }, lane));
    }
    if (counts.scanned % 5_000 === 0 || rows.length < BATCH) {
      process.stdout.write(
        `Scanned ${counts.scanned.toLocaleString("sv-SE")} listings (${counts.rejected.toLocaleString("sv-SE")} rejected)${WRITE ? " and saved" : ""}…\n`,
      );
    }
  }

  console.log(
    WRITE
      ? QUARANTINE_ONLY
        ? "Rejected listings quarantined; non-rejected rows were left untouched."
        : "Listing quality backfill written."
      : "Listing quality dry run (pass --write to persist).",
  );
  console.table(counts);
  console.table(
    [...reasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => ({ reason, count })),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
