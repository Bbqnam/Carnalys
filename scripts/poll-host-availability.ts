import "dotenv/config";
import { pollHostAvailability } from "../src/infrastructure/database/listing-availability-repository";
import { prisma } from "../src/infrastructure/database/prisma";
import { refreshCatalogFacets } from "../src/infrastructure/database/catalog-facet-repository";
import { listingSources } from "../src/infrastructure/marketplaces/source-registry";

const write = process.argv.includes("--write");
const requested = process.argv.find(arg => arg.startsWith("--source="))?.split("=")[1];
const parsed = Number(process.argv.find(arg => arg.startsWith("--limit="))?.split("=")[1] ?? process.env.HOST_AVAILABILITY_POLL_LIMIT ?? 1500);
if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20_000) throw new Error("--limit must be 1..20000");
if (requested && !(requested in listingSources)) throw new Error("Unknown --source");

async function main() {
  for (const provider of requested ? [requested] : Object.keys(listingSources)) {
    const stats = await pollHostAvailability({ provider, limit: parsed, write });
    console.log(JSON.stringify({ mode: write ? "write" : "dry-run", ...stats }));
  }
  if (write) await refreshCatalogFacets();
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
