import "dotenv/config";

/**
 * One-off: re-fetch the detail page for every active Bytbil listing we already
 * hold and rewrite it through the normal ingest path, so prices frozen since
 * first enrichment are brought current. Does not discover new listings.
 *
 *   npx tsx --env-file=.env src/scripts/reenrich-bytbil.ts
 */
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import { upsertNormalizedListings } from "@/infrastructure/database/listing-write-repository";
import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";
import { BytbilClient } from "@/infrastructure/marketplaces/bytbil/client";
import { parseBytbilDetailPage } from "@/infrastructure/marketplaces/bytbil/parser";
import { normalizeBytbilListing } from "@/infrastructure/marketplaces/bytbil/normalizer";
import type { BytbilSearchDocument } from "@/infrastructure/marketplaces/bytbil/types";

const CONCURRENCY = 3;
const PACE_MS = 700;
const ANALYSIS_BATCH = 300;

function documentFromPayload(raw: unknown): BytbilSearchDocument | undefined {
  const payload =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  const d =
    payload?.document && typeof payload.document === "object"
      ? (payload.document as Record<string, unknown>)
      : undefined;
  if (!d || typeof d.id !== "string" || typeof d.detailPath !== "string") return undefined;
  return {
    id: d.id,
    detailPath: d.detailPath,
    title: typeof d.title === "string" ? d.title : "",
    modelYear: typeof d.modelYear === "number" ? d.modelYear : undefined,
    mileageMil: typeof d.mileageMil === "number" ? d.mileageMil : undefined,
    priceAmount: typeof d.priceAmount === "number" ? d.priceAmount : undefined,
    location: typeof d.location === "string" ? d.location : undefined,
    featuredImageUrl:
      typeof d.featuredImageUrl === "string" ? d.featuredImageUrl : undefined,
    publishedAt: typeof d.publishedAt === "string" ? new Date(d.publishedAt) : undefined,
    raw: d,
  };
}

async function main() {
  await initializeDatabase();
  const client = new BytbilClient();

  const rows = await prisma.listingRecord.findMany({
    where: { provider: "bytbil", status: "active" },
    select: { id: true, sourceScope: true, priceAmount: true, rawPayload: true },
  });
  console.log(`${rows.length} aktiva Bytbil-annonser att uppdatera…`);

  const targets = rows
    .map((row) => ({ row, document: documentFromPayload(row.rawPayload) }))
    .filter(
      (t): t is { row: (typeof rows)[number]; document: BytbilSearchDocument } =>
        Boolean(t.document),
    );
  console.log(`${targets.length} har en rekonstruerbar sökpost.`);

  const syncedAt = new Date();
  const changed: string[] = [];
  let processed = 0;
  let priceChanges = 0;
  let failures = 0;
  const laneAt = new Array<number>(CONCURRENCY).fill(0);
  let cursor = 0;

  async function pace(lane: number) {
    const wait = PACE_MS - (Date.now() - laneAt[lane]);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  async function runLane(lane: number) {
    while (cursor < targets.length) {
      const { row, document } = targets[cursor++];
      await pace(lane);
      try {
        const html = await client.detail(document.detailPath);
        laneAt[lane] = Date.now();
        const detail = parseBytbilDetailPage(html);
        const normalized = normalizeBytbilListing(
          document,
          detail,
          row.sourceScope ?? "all-vehicles",
          true,
        );
        (normalized.rawPayload as { detailFetchedAt?: string }).detailFetchedAt =
          new Date().toISOString();
        const result = await upsertNormalizedListings([normalized], syncedAt);
        for (const id of result.changedListingIds) changed.push(id);
        const newPrice = normalized.listing.priceAmount;
        if (newPrice && newPrice !== row.priceAmount) {
          priceChanges += 1;
          if (priceChanges <= 25) {
            console.log(`  ${row.priceAmount} -> ${newPrice}  (${document.detailPath})`);
          }
        }
      } catch (error) {
        laneAt[lane] = Date.now();
        failures += 1;
        if (failures <= 10) {
          console.warn(`  miss ${document.id}: ${(error as Error).message}`);
        }
      }
      processed += 1;
      if (processed % 200 === 0) {
        console.log(
          `  …${processed}/${targets.length}  (prisändringar ${priceChanges}, fel ${failures})`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => runLane(i)));
  console.log(
    `Klart: ${processed} bearbetade, ${priceChanges} prisändringar, ${changed.length} skrivna, ${failures} fel.`,
  );

  // Re-analyse every cohort touched: a changed Bytbil price shifts the market
  // value of every car of that make+model, not just the Bytbil ones.
  if (changed.length > 0) {
    const changedVehicles = await prisma.listingRecord.findMany({
      where: { id: { in: changed } },
      select: { vehicle: { select: { make: true, model: true } } },
    });
    const cohorts = new Map(
      changedVehicles.map((r) => [
        JSON.stringify([r.vehicle.make, r.vehicle.model]),
        { make: r.vehicle.make, model: r.vehicle.model },
      ]),
    );
    const cohortListings = await prisma.listingRecord.findMany({
      where: {
        status: "active",
        vehicle: { is: { OR: [...cohorts.values()] } },
      },
      select: { id: true },
    });
    const ids = cohortListings.map((r) => r.id);
    console.log(
      `Omanalyserar ${ids.length} annonser i ${cohorts.size} berörda modellkohorter…`,
    );
    for (let i = 0; i < ids.length; i += ANALYSIS_BATCH) {
      const batch = ids.slice(i, i + ANALYSIS_BATCH);
      await refreshStoredListingAnalyses(batch, batch.length);
      console.log(`  analys ${Math.min(i + ANALYSIS_BATCH, ids.length)}/${ids.length}`);
    }
  }

  console.log("Färdig.");
}

main()
  .catch((error: unknown) => {
    console.error("Bytbil-omhämtningen misslyckades.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
