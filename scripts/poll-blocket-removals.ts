import "dotenv/config";
import { prisma, initializeDatabase } from "../src/infrastructure/database/prisma";
import { BlocketUnofficialClient } from "../src/infrastructure/marketplaces/blocket-unofficial/client";
import type { BlocketMissingKind } from "../src/infrastructure/marketplaces/blocket-unofficial/availability";

// Layered removal poll:
//   1. cheap unofficial-API check  -> catches hard 404s (proxy "purged"/unknown)
//   2. for anything the API still calls active, fetch the REAL Blocket ad page
//      -> catches the "deactivated" state the proxy can't see
//
//   node --import tsx scripts/poll-blocket-removals.ts [--limit=N] [--write] [--concurrency=N]
//
// Without --write it is read-only and only prints what it WOULD do.

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const envInt = (name: string, fallback: number) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const LIMIT = Number(args.get("limit") ?? envInt("BLOCKET_POLL_LIMIT", 3000));
const WRITE = args.get("write") === "true" || process.env.BLOCKET_POLL_WRITE === "1";
const CONCURRENCY = Number(args.get("concurrency") ?? envInt("BLOCKET_POLL_CONCURRENCY", 12));
const PROVIDER = "blocket_unofficial";
const DAY = 86_400_000;

type Row = {
  id: string;
  externalId: string;
  listingUrl: string;
  priceAmount: number;
  previousPriceAmount: number | null;
  mileageKm: number;
  sellerType: string;
  vehicleId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  availabilityCheckedAt: Date | null;
};

type Outcome =
  | { kind: "active" }
  | { kind: "inconclusive"; reason: string }
  | { kind: "missing"; missingKind: BlocketMissingKind; reason: string; via: "api" | "page" };

async function check(client: BlocketUnofficialClient, row: Row): Promise<Outcome> {
  const verdict = await client.checkListingAvailability({
    externalId: row.externalId,
    listingUrl: row.listingUrl,
  });
  if (verdict.availability === "missing") {
    return {
      kind: "missing",
      missingKind: verdict.missingKind ?? "unknown",
      reason: verdict.reason,
      via: verdict.via,
    };
  }
  if (verdict.availability === "active") return { kind: "active" };
  return { kind: "inconclusive", reason: verdict.reason };
}

async function recordMissing(row: Row, outcome: Extract<Outcome, { kind: "missing" }>, checkedAt: Date) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.listingRecord.findUnique({ where: { id: row.id }, select: { status: true, removedAt: true } });
    await tx.listingRecord.update({
      where: { id: row.id },
      data: {
        status: "removed",
        removedAt: current?.removedAt ?? checkedAt,
        availabilityCheckedAt: checkedAt,
        availabilityCheckStatus: `missing:${outcome.missingKind}`,
      },
    });
    const existing = await tx.listingObservation.findFirst({
      where: { listingId: row.id, kind: "disappeared" },
      select: { id: true },
    });
    if (!existing) {
      await tx.listingObservation.createMany({
        data: [{
          listingId: row.id,
          provider: PROVIDER,
          observedAt: checkedAt,
          kind: "disappeared",
          priceAmount: row.priceAmount,
          previousPriceAmount: row.previousPriceAmount,
          mileageKm: row.mileageKm,
          sellerType: row.sellerType,
          status: "removed",
        }],
        skipDuplicates: true,
      });
    }
  });
}

async function main() {
  await initializeDatabase();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, "externalId", "listingUrl", "priceAmount", "previousPriceAmount", "mileageKm",
            "sellerType", "vehicleId", "firstSeenAt", "lastSeenAt", "availabilityCheckedAt"
     FROM "ListingRecord"
     WHERE provider = $1 AND status = 'active'
     ORDER BY "availabilityCheckedAt" ASC NULLS FIRST, "missingReconciliationCount" DESC, "lastSeenAt" ASC
     LIMIT $2`,
    PROVIDER,
    LIMIT,
  );

  const client = new BlocketUnofficialClient();
  const started = Date.now();
  const stats = {
    checked: 0, active: 0, inconclusive: 0,
    missingApi: 0, missingPurged: 0, missingDeactivated: 0,
    newlyRemoved: 0, newObservations: 0, neverChecked: rows.filter((r) => !r.availabilityCheckedAt).length,
  };
  const samples: string[] = [];
  const withPage: { row: Row; outcome: Extract<Outcome, { kind: "missing" }> }[] = [];

  let i = 0;
  async function lane() {
    while (i < rows.length) {
      const row = rows[i++];
      const checkedAt = new Date();
      let outcome: Outcome;
      try {
        outcome = await check(client, row);
      } catch (e) {
        outcome = { kind: "inconclusive", reason: (e as Error).message };
      }
      stats.checked++;

      if (outcome.kind === "active") {
        stats.active++;
        if (WRITE) await prisma.listingRecord.updateMany({ where: { id: row.id, status: "active" }, data: { availabilityCheckedAt: checkedAt, availabilityCheckStatus: "active" } });
      } else if (outcome.kind === "inconclusive") {
        stats.inconclusive++;
        if (WRITE) await prisma.listingRecord.updateMany({ where: { id: row.id, status: "active" }, data: { availabilityCheckedAt: checkedAt, availabilityCheckStatus: "inconclusive" } });
      } else {
        if (outcome.via === "api") stats.missingApi++;
        else if (outcome.missingKind === "deactivated") stats.missingDeactivated++;
        else stats.missingPurged++;
        withPage.push({ row, outcome });
        if (WRITE) {
          await recordMissing(row, outcome, checkedAt);
          stats.newlyRemoved++;
          stats.newObservations++;
        }
        if (samples.length < 20) {
          const ageD = Math.round((started - row.firstSeenAt.getTime()) / DAY);
          samples.push(
            `  ${outcome.missingKind.toUpperCase().padEnd(11)} via ${outcome.via.padEnd(4)}  ${row.sellerType.padEnd(8)}  ${String(row.priceAmount).padStart(8)} kr  ${ageD}d old  ${row.listingUrl}`,
          );
        }
      }
      if (stats.checked % 250 === 0) process.stdout.write(`  …${stats.checked}/${rows.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, lane));

  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  const ages = rows.map((r) => (started - r.firstSeenAt.getTime()) / DAY);
  console.log(`\n=== Blocket removal poll ${WRITE ? "(WRITE)" : "(dry run)"} — ${rows.length} listings, ${elapsed}s ===`);
  console.log(`checked            ${stats.checked}`);
  console.log(`active             ${stats.active}`);
  console.log(`inconclusive       ${stats.inconclusive}`);
  console.log(`missing (total)    ${stats.missingApi + stats.missingPurged + stats.missingDeactivated}`);
  console.log(`  · via API 404    ${stats.missingApi}   (proxy said gone, kind unknown)`);
  console.log(`  · page purged    ${stats.missingPurged}   (real page 404)`);
  console.log(`  · page DEACTIVATED ${stats.missingDeactivated}   ("sold or removed from the market")`);
  console.log(`never checked before ${stats.neverChecked}`);
  console.log(`sample listing age   ${Math.min(...ages).toFixed(1)}–${Math.max(...ages).toFixed(1)} days (mean ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)})`);
  if (WRITE) {
    console.log(`\nWROTE: ${stats.newlyRemoved} listings -> removed, ${stats.newObservations} disappeared observations`);
  } else {
    console.log(`\nWOULD mark ${withPage.length} listings removed. Sample:`);
  }
  console.log(samples.join("\n"));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
