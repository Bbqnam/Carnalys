import "dotenv/config";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";
import { writeFile, readFile } from "node:fs/promises";

const listingId = process.argv[3] ?? "listing_3c30bfa3a3431f06f349";
const mode = process.argv[2] ?? "after";
const file = ".powertrain-diagnostic-before.json";

async function snapshot() {
  return prisma.listingRecord.findUniqueOrThrow({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      priceAmount: true,
      mileageKm: true,
      vehicle: {
        select: {
          make: true,
          model: true,
          variant: true,
          modelYear: true,
          fuelType: true,
          fuelTypeConfidence: true,
          fuelTypeEvidence: true,
          drivetrain: true,
          horsepower: true,
          generation: true,
        },
      },
      analysis: {
        select: {
          marketValueAmount: true,
          comparableCount: true,
          comparablePrices: true,
          comparableInsights: true,
          valuationSanity: true,
          methodologyVersion: true,
        },
      },
    },
  });
}

async function main() {
  await initializeDatabase();
  if (mode === "before") {
    const before = await snapshot();
    await writeFile(file, JSON.stringify(before, null, 2));
    console.log("POWERTRAIN_DIAGNOSTIC_BEFORE");
    console.log(JSON.stringify(before, null, 2));
    return;
  }

  await refreshStoredListingAnalyses([listingId], 1);
  const before = JSON.parse(await readFile(file, "utf8"));
  const after = await snapshot();
  console.log("POWERTRAIN_DIAGNOSTIC_RESULT");
  console.log(JSON.stringify({ before, after }, null, 2));
}

main().finally(() => prisma.$disconnect());
