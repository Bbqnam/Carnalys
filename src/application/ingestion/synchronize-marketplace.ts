import type { MarketplaceImporter } from "./types";
import {
  beginImportRun,
  failImportRun,
  finishImportRun,
  markMissingListingsRemoved,
  upsertNormalizedListings,
} from "@/infrastructure/database/listing-write-repository";

export async function synchronizeMarketplace(importer: MarketplaceImporter) {
  const startedAt = new Date();
  const run = await beginImportRun(importer.provider, importer.scope, startedAt);
  let fetchedCount = 0;
  let importedCount = 0;
  let failedCount = 0;
  let processedChunks = 0;

  try {
    for await (const chunk of importer.import()) {
      fetchedCount += chunk.listings.length;
      failedCount += chunk.rejectedCount;
      processedChunks += 1;

      try {
        await upsertNormalizedListings(chunk.listings, startedAt);
        importedCount += chunk.listings.length;
      } catch (error) {
        failedCount += chunk.listings.length;
        console.error("Kunde inte spara en importerad annonssida:", error);
      }

      if (processedChunks % 20 === 0) {
        console.log(`${importedCount.toLocaleString("sv-SE")} annonser sparade…`);
      }
    }

    if (importedCount === 0) {
      throw new Error("Ingen hämtad annons kunde sparas; cachen lämnades orörd.");
    }

    const removedCount = await markMissingListingsRemoved(
      importer.provider,
      importer.scope,
      startedAt,
    );
    await finishImportRun(run.id, {
      fetchedCount,
      importedCount,
      failedCount,
      removedCount,
    });

    return { importedCount, failedCount, removedCount };
  } catch (error) {
    await failImportRun(run.id, error);
    throw error;
  }
}
