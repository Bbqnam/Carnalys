import "dotenv/config";

import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  await initializeDatabase();
  const batchSize = positiveInteger(process.env.ANALYSIS_BATCH_SIZE, 250);
  const maximumListings = positiveInteger(process.argv[2], Number.MAX_SAFE_INTEGER);
  let analyzed = 0;

  while (analyzed < maximumListings) {
    const processed = await refreshStoredListingAnalyses(
      undefined,
      Math.min(batchSize, maximumListings - analyzed),
    );
    if (processed === 0) break;
    analyzed += processed;
    console.log(`${analyzed.toLocaleString("sv-SE")} analyser sparade…`);
  }

  console.log(
    analyzed === 0
      ? "Alla aktiva annonser har redan en aktuell sparad analys."
      : `Klart: ${analyzed.toLocaleString("sv-SE")} analyser uppdaterades.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Bakgrundsanalysen misslyckades.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
