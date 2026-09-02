import "dotenv/config";

/**
 * Phase B: recompute Deal Score / market value for every active listing whose
 * stored analysis predates the current methodology (bumped to
 * `canonical-taxonomy-cohorts-11.0` when the cohort tiers changed). Run after
 * the taxonomy backfill so no stale Deal Score survives a materially different
 * comparable cohort.
 *
 *   npx tsx src/scripts/reanalyze-changed-cohorts.ts [--batch=250] [--max=100000]
 *
 * Idempotent and restartable: `refreshStoredListingAnalyses` only picks rows
 * that still carry an older methodology version, so a re-run resumes.
 */

import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import { refreshStoredListingAnalyses } from "@/infrastructure/database/listing-analysis-repository";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);
const BATCH = Math.max(1, Math.min(Number(args.get("batch") ?? 250), 1000));
const MAX = Number(args.get("max") ?? 1_000_000);

async function main() {
  await initializeDatabase();
  const started = Date.now();
  let done = 0;
  for (;;) {
    const n = await refreshStoredListingAnalyses(undefined, BATCH);
    done += n;
    process.stdout.write(
      `  reanalyzed ${done}  (+${n}, ${((Date.now() - started) / 1000).toFixed(0)}s)\n`,
    );
    if (n < BATCH || done >= MAX) break;
  }
  console.log(`\nDone — ${done} listing analyses recomputed in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
