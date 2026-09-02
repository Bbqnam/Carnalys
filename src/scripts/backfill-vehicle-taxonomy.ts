import "dotenv/config";

/**
 * Backfill the canonical vehicle taxonomy onto every stored VehicleRecord.
 *
 *   npx tsx src/scripts/backfill-vehicle-taxonomy.ts [--dry-run] [--limit=N] [--make=Kia] [--batch=1000]
 *
 * - Idempotent & restartable: processes rows whose `normalizationVersion` is not
 *   the current one, oldest id first; a re-run resumes where it stopped.
 * - Touches only VehicleRecord. Never merges/deletes vehicle rows, never writes
 *   ListingRecord / ListingObservation / analysis / images / prices.
 * - Only writes columns that actually change (plus the version cursor), so
 *   unchanged rows are not rewritten.
 * - `--dry-run` writes nothing and prints the before/after distribution.
 */

import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import {
  canonicalizeVehicle,
  CURRENT_NORMALIZATION_VERSION,
} from "@/domain/vehicle/taxonomy";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const DRY_RUN = args.get("dry-run") === "true";
const LIMIT = args.has("limit") ? Number(args.get("limit")) : Infinity;
const BATCH = Math.max(1, Math.min(Number(args.get("batch") ?? 1000), 5000));
const MAKE_FILTER = args.get("make");

type Row = {
  id: string;
  make: string;
  model: string;
  variant: string | null;
  bodyStyle: string;
  fuelType: string;
  modelYear: number;
  rawMake: string | null;
  rawModel: string | null;
  generation: string | null;
  trim: string | null;
  performanceVariant: string | null;
  normalizationVersion: number;
};

const CHANGED_FIELDS = [
  "make",
  "model",
  "bodyStyle",
  "fuelType",
  "generation",
  "trim",
  "performanceVariant",
] as const;

async function main() {
  await initializeDatabase();

  const total = await prisma.vehicleRecord.count({
    where: {
      normalizationVersion: { not: CURRENT_NORMALIZATION_VERSION },
      ...(MAKE_FILTER ? { OR: [{ make: MAKE_FILTER }, { rawMake: MAKE_FILTER }] } : {}),
    },
  });
  console.log(
    `Backfill taxonomy v${CURRENT_NORMALIZATION_VERSION} ${DRY_RUN ? "(DRY RUN)" : "(WRITE)"} — ${total} rows to process${MAKE_FILTER ? ` (make=${MAKE_FILTER})` : ""}\n`,
  );

  const stats = {
    scanned: 0,
    changed: 0,
    makeChanged: 0,
    modelChanged: 0,
    bodyFilled: 0,
    fuelFilled: 0,
    generationSet: 0,
    trimSet: 0,
    performanceSet: 0,
    cohortKeyChanged: 0,
    contradictions: 0,
  };
  const modelChangeByMake = new Map<string, number>();
  const samples: string[] = [];

  let cursor: string | undefined;
  while (stats.scanned < LIMIT) {
    const take = Math.min(BATCH, LIMIT - stats.scanned);
    const rows: Row[] = await prisma.vehicleRecord.findMany({
      where: {
        normalizationVersion: { not: CURRENT_NORMALIZATION_VERSION },
        ...(MAKE_FILTER ? { OR: [{ make: MAKE_FILTER }, { rawMake: MAKE_FILTER }] } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take,
      select: {
        id: true,
        make: true,
        model: true,
        variant: true,
        bodyStyle: true,
        fuelType: true,
        modelYear: true,
        rawMake: true,
        rawModel: true,
        generation: true,
        trim: true,
        performanceVariant: true,
        normalizationVersion: true,
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    // One representative title per vehicle for token context.
    const titleByVehicle = new Map<string, string>();
    const listingRows = await prisma.listingRecord.findMany({
      where: { vehicleId: { in: rows.map((r) => r.id) } },
      orderBy: [{ isVehicleRepresentative: "desc" }, { synchronizedAt: "desc" }],
      select: { vehicleId: true, title: true },
    });
    for (const l of listingRows) {
      if (l.title && !titleByVehicle.has(l.vehicleId)) titleByVehicle.set(l.vehicleId, l.title);
    }

    const updates: { id: string; data: Record<string, unknown> }[] = [];

    for (const row of rows) {
      stats.scanned += 1;
      const sourceMake = row.rawMake ?? row.make;
      const sourceModel = row.rawModel ?? row.model;
      const canonical = canonicalizeVehicle({
        make: sourceMake,
        model: sourceModel,
        variant: row.variant,
        title: titleByVehicle.get(row.id) ?? null,
        bodyStyle: row.bodyStyle as never,
        fuelType: row.fuelType as never,
        modelYear: row.modelYear,
      });

      if (canonical.contradictions.length > 0) stats.contradictions += 1;

      const next: Record<string, unknown> = {
        make: canonical.make,
        model: canonical.model,
        bodyStyle: canonical.bodyStyle,
        fuelType: canonical.fuelType,
        generation: canonical.generation,
        trim: canonical.trim,
        performanceVariant: canonical.performanceVariant,
      };

      const data: Record<string, unknown> = {
        normalizationVersion: CURRENT_NORMALIZATION_VERSION,
      };
      if (row.rawMake == null) data.rawMake = sourceMake;
      if (row.rawModel == null) data.rawModel = sourceModel;

      let rowChanged = false;
      for (const field of CHANGED_FIELDS) {
        if ((row as Record<string, unknown>)[field] !== next[field]) {
          data[field] = next[field];
          rowChanged = true;
        }
      }

      if (rowChanged) {
        stats.changed += 1;
        if (row.make !== canonical.make) stats.makeChanged += 1;
        if (row.model !== canonical.model) {
          stats.modelChanged += 1;
          modelChangeByMake.set(canonical.make, (modelChangeByMake.get(canonical.make) ?? 0) + 1);
        }
        if (row.bodyStyle === "other" && canonical.bodyStyle !== "other") stats.bodyFilled += 1;
        if (row.fuelType === "other" && canonical.fuelType !== "other") stats.fuelFilled += 1;
        if (!row.generation && canonical.generation) stats.generationSet += 1;
        if (!row.trim && canonical.trim) stats.trimSet += 1;
        if (!row.performanceVariant && canonical.performanceVariant) stats.performanceSet += 1;
        const before = `${row.make}|${row.model}|${row.bodyStyle}|${row.fuelType}`;
        const after = `${canonical.make}|${canonical.model}|${canonical.bodyStyle}|${canonical.fuelType}`;
        if (before !== after) stats.cohortKeyChanged += 1;
        if (samples.length < 25) {
          samples.push(
            `  ${row.make} ${row.model}${row.variant ? ` [${row.variant.slice(0, 34)}]` : ""}` +
              `  →  ${canonical.make} ${canonical.model}` +
              `  body ${row.bodyStyle}→${canonical.bodyStyle}  fuel ${row.fuelType}→${canonical.fuelType}` +
              `${canonical.generation ? `  gen ${canonical.generation}` : ""}` +
              `${canonical.performanceVariant ? `  perf ${canonical.performanceVariant}` : ""}` +
              `${canonical.trim ? `  trim ${canonical.trim}` : ""}`,
          );
        }
      }

      updates.push({ id: row.id, data });
    }

    if (!DRY_RUN && updates.length > 0) {
      await prisma.$transaction(
        updates.map(({ id, data }) => prisma.vehicleRecord.update({ where: { id }, data })),
      );
    }

    process.stdout.write(
      `  …${stats.scanned}/${Number.isFinite(LIMIT) ? Math.min(LIMIT, total) : total}  (changed ${stats.changed})\n`,
    );
  }

  console.log(`\n=== ${DRY_RUN ? "DRY RUN" : "DONE"} ===`);
  console.table({
    scanned: stats.scanned,
    "rows changed": stats.changed,
    "make changed": stats.makeChanged,
    "model family changed": stats.modelChanged,
    "bodyStyle other→filled": stats.bodyFilled,
    "fuelType other→filled": stats.fuelFilled,
    "generation set": stats.generationSet,
    "trim set": stats.trimSet,
    "performanceVariant set": stats.performanceSet,
    "cohort key changed (Phase B input)": stats.cohortKeyChanged,
    "rows with a source contradiction": stats.contradictions,
  });
  console.log("\nModel-family changes by canonical make:");
  console.table(
    [...modelChangeByMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([make, n]) => ({ make, n })),
  );
  console.log("\nSample transforms:");
  console.log(samples.join("\n"));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
