import "dotenv/config";

import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import { prisma } from "@/infrastructure/database/prisma";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";

async function main() {
  console.log("Hämtar aktuella fordonsannonser…");
  const result = await synchronizeMarketplace(new BlocketUnofficialImporter());
  console.log(
    `Klart: ${result.importedCount} sparade, ${result.failedCount} ofullständiga, ${result.removedCount} markerade som borttagna.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Synkroniseringen misslyckades. Befintlig cache används vidare.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
