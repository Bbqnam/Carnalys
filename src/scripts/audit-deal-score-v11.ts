import "dotenv/config";

import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";

async function main() {
  await initializeDatabase();
  const listings = await prisma.listingRecord.findMany({
    where: {
      status: "active",
      priceAmount: { gte: 49_949, lte: 103_737 },
      mileageKm: { lte: 202_000 },
      vehicle: { is: { transmission: "automatic", modelYear: { gte: 2010 } } },
    },
    orderBy: [
      { analysis: { confidenceRank: "desc" } },
      { analysis: { dealScore: { sort: "desc", nulls: "last" } } },
      { id: "asc" },
    ],
    take: 50,
    select: {
      id: true,
      title: true,
      provider: true,
      priceAmount: true,
      mileageKm: true,
      ownerCount: true,
      listingUrl: true,
      vehicle: { select: { make: true, model: true, modelYear: true, bodyStyle: true } },
      analysis: {
        select: {
          dealScore: true,
          confidence: true,
          comparableCount: true,
          scoringVersion: true,
          dealScoreFactors: true,
        },
      },
    },
  });

  console.table(
    listings.map((listing, index) => ({
      rank: index + 1,
      id: listing.id,
      car: `${listing.vehicle.make} ${listing.vehicle.model}`,
      year: listing.vehicle.modelYear,
      mileageMil: Math.round(listing.mileageKm / 10),
      owners: listing.ownerCount ?? "?",
      price: listing.priceAmount,
      score: listing.analysis?.dealScore ?? "unrated",
      confidence: listing.analysis?.confidence ?? "unrated",
      comparables: listing.analysis?.comparableCount ?? 0,
      version: listing.analysis?.scoringVersion ?? "missing",
      title: listing.title,
    })),
  );

  console.log(JSON.stringify(listings, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("Deal Score v11 audit failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
