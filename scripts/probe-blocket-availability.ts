import "dotenv/config";
import { BlocketUnofficialClient } from "../src/infrastructure/marketplaces/blocket-unofficial/client";
import { prisma, initializeDatabase } from "../src/infrastructure/database/prisma";

// Read-only controlled integration test for the Blocket availability detector.
// It classifies a handful of known examples and prints the verdict for each. It
// NEVER writes to the database or mutates a real listing — it only SELECTs one
// currently-active advert id to use as the "should be active" case.

async function main() {
  const live = new BlocketUnofficialClient();

  await initializeDatabase();
  const [activeRow] = await prisma.$queryRawUnsafe<{ externalId: string; listingUrl: string }[]>(
    `SELECT "externalId", "listingUrl" FROM "ListingRecord"
     WHERE provider = 'blocket_unofficial' AND status = 'active'
     ORDER BY "lastSeenAt" DESC LIMIT 1`,
  );
  // A listing a previous poll already proved gone — the unofficial proxy still
  // serves cached data for it, so this is the case the layered check must catch.
  const [goneRow] = await prisma.$queryRawUnsafe<{ externalId: string; listingUrl: string; availabilityCheckStatus: string }[]>(
    `SELECT "externalId", "listingUrl", "availabilityCheckStatus" FROM "ListingRecord"
     WHERE provider = 'blocket_unofficial' AND status = 'removed'
       AND "availabilityCheckStatus" LIKE 'missing:%'
     ORDER BY "removedAt" DESC LIMIT 1`,
  );

  const timeoutClient = new BlocketUnofficialClient("https://blocket-api.se", async () => {
    throw new DOMException("The operation timed out.", "TimeoutError");
  });
  const serverErrorClient = new BlocketUnofficialClient(
    "https://blocket-api.se",
    async () => new Response("Service Unavailable", { status: 503 }),
  );

  type Verdict = { availability: string; reason: string; status?: number | null; via?: string };
  const cases: Array<{ label: string; run: () => Promise<Verdict> }> = [
    {
      label: `active advert — proxy only (live id ${activeRow?.externalId ?? "n/a"})`,
      run: () => live.inspectCarAvailability(activeRow?.externalId ?? "0"),
    },
    {
      label: `active advert — layered (live id ${activeRow?.externalId ?? "n/a"})`,
      run: () =>
        live.checkListingAvailability({
          externalId: activeRow?.externalId ?? "0",
          listingUrl: activeRow?.listingUrl ?? "https://www.blocket.se/",
        }),
    },
    {
      label: `known-gone advert — layered (id ${goneRow?.externalId ?? "n/a"}, db ${goneRow?.availabilityCheckStatus ?? "n/a"})`,
      run: () =>
        goneRow
          ? live.checkListingAvailability({ externalId: goneRow.externalId, listingUrl: goneRow.listingUrl })
          : Promise.resolve({ availability: "skipped", reason: "no removed listing on record" }),
    },
    {
      label: `known-gone advert — proxy only (id ${goneRow?.externalId ?? "n/a"})`,
      run: () => live.inspectCarAvailability(goneRow?.externalId ?? "0"),
    },
    { label: "definitely nonexistent advert (id 1)", run: () => live.inspectCarAvailability("1") },
    { label: "definitely nonexistent advert (id 999999999999)", run: () => live.inspectCarAvailability("999999999999") },
    { label: "malformed identifier (id 'not-a-number')", run: () => live.inspectCarAvailability("not-a-number") },
    { label: "simulated request timeout", run: () => timeoutClient.inspectCarAvailability("25527952") },
    { label: "simulated service failure (HTTP 503)", run: () => serverErrorClient.inspectCarAvailability("25527952") },
  ];

  console.log("Blocket availability detector — controlled integration probe\n");
  for (const testCase of cases) {
    try {
      const verdict = await testCase.run();
      const detail = verdict.via ? `via ${verdict.via}` : `upstream HTTP ${verdict.status ?? "none"}`;
      console.log(`• ${testCase.label}\n    -> ${verdict.availability.toUpperCase()} (${detail})\n       ${verdict.reason}\n`);
    } catch (error) {
      console.log(`• ${testCase.label}\n    -> ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
