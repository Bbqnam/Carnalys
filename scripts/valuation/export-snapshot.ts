import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { Client } from "pg";
import { enforceVerifiedPostgresSsl } from "../../src/infrastructure/database/connection-string";

async function main() {
  const output = resolve(process.argv[2] ?? `artifacts/valuation/snapshot-${new Date().toISOString().replaceAll(":", "-")}.json`);
  const connection = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "");
  if (process.env.CARNALYS_TEST_DATABASE_HOST) {
    if (!/^ep-[a-z0-9-]+\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/.test(process.env.CARNALYS_TEST_DATABASE_HOST)) throw new Error("Invalid isolated Neon host");
    connection.hostname = process.env.CARNALYS_TEST_DATABASE_HOST;
  }
  const client = new Client({ connectionString: enforceVerifiedPostgresSsl(connection.toString()) });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: clock } = await client.query("SELECT CURRENT_TIMESTAMP AS captured_at");
    const { rows } = await client.query(`
      SELECT DISTINCT ON (l."vehicleId") l."id",l."vehicleId",l."provider",l."priceAmount",l."mileageKm",l."mileageKnown",
        l."sellerType",l."validationStatus",l."valuationEligible",l."firstSeenAt",l."synchronizedAt" AS "observedAt",
        l."availabilityConfirmedAt",l."priceConfirmedAt",l."sellerName",l."sellerOrganizationNumber",
        v."make",v."model",v."modelYear",v."bodyStyle",v."fuelType",v."powertrainType",v."transmission",v."drivetrain",
        v."generation",v."facelift",v."trim",v."performanceVariant",v."horsepower",v."engineDisplacement",v."normalizationVersion",
        (v."vin" IS NOT NULL OR v."registrationNumber" IS NOT NULL) AS "physicalIdentityKnown",
        CASE WHEN a."comparableCount">=3 THEN a."marketValueAmount" END AS "servedValue",
        a."methodologyVersion" AS "servedMethodology",a."valuationConfidenceScore" AS "servedConfidence",
        a."dealScore" AS "servedDealScore",a."calculatedAt" AS "servedCalculatedAt"
      FROM "ListingRecord" l JOIN "VehicleRecord" v ON v."id"=l."vehicleId"
      LEFT JOIN "ListingAnalysisRecord" a ON a."listingId"=l."id"
      WHERE l."status"='active'
      ORDER BY l."vehicleId",l."synchronizedAt" DESC,l."id" ASC
    `);
    await client.query("COMMIT");
    const vehicles = rows.map(row => {
      const { sellerName, sellerOrganizationNumber, ...facts } = row;
      return { ...facts, sellerCluster: createHash("sha256").update(sellerOrganizationNumber ?? sellerName ?? row.vehicleId).digest("hex") };
    });
    const serialized = JSON.stringify(vehicles);
    const dataset = { manifest: {
      schema: "carnalys-valuation-snapshot-1", capturedAt: clock[0].captured_at,
      rows: vehicles.length, sha256: createHash("sha256").update(serialized).digest("hex"),
      priceTarget: "advertised-asking-price", identityUnit: "physical-vehicle",
      limitations: ["Current attribute snapshot; cannot reconstruct historical specifications", "Unknown-identity listings may still contain unresolved duplicates", "No transaction-price labels"],
    }, vehicles };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(dataset), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ output, manifest: dataset.manifest }, null, 2));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Snapshot failed"); process.exitCode = 1; });
