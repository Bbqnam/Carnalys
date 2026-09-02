// Deployment guard for two obsolete migrations that a previous iteration tried
// to ship and that failed in production:
//
//   20260902110000_add_verified_missing_observation_kind
//   20260902110500_support_verified_missing_observations
//
// They attempted to add a "verified_missing" value to the ListingObservationKind
// enum. That approach was abandoned — verified Blocket removals are recorded
// with the existing "disappeared" kind — but a half-applied / failed row for
// either name in "_prisma_migrations" makes `prisma migrate deploy` refuse to
// run. This marks ONLY those two rows rolled back, and ONLY when they exist and
// are actually unfinished. It never touches any other migration and never
// swallows an unrelated failure: any unexpected error aborts the deploy.

import pg from "pg";

const OBSOLETE_MIGRATIONS = [
  "20260902110000_add_verified_missing_observation_kind",
  "20260902110500_support_verified_missing_observations",
];

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("recover-failed-report-migrations: DIRECT_URL / DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const { rows: tableRows } = await client.query(
    `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS present`,
  );
  if (!tableRows[0]?.present) {
    console.log("recover-failed-report-migrations: no _prisma_migrations table yet, nothing to do.");
    process.exit(0);
  }

  for (const name of OBSOLETE_MIGRATIONS) {
    const { rows } = await client.query(
      `SELECT finished_at, rolled_back_at
         FROM "_prisma_migrations"
        WHERE migration_name = $1`,
      [name],
    );
    if (rows.length === 0) continue;

    const stuck = rows.some((row) => row.finished_at === null && row.rolled_back_at === null);
    if (!stuck) {
      console.log(`recover-failed-report-migrations: ${name} already resolved, leaving it.`);
      continue;
    }

    const { rowCount } = await client.query(
      `UPDATE "_prisma_migrations"
          SET rolled_back_at = now()
        WHERE migration_name = $1
          AND finished_at IS NULL
          AND rolled_back_at IS NULL`,
      [name],
    );
    console.log(`recover-failed-report-migrations: marked ${rowCount} failed row(s) for ${name} rolled back.`);
  }
} catch (error) {
  console.error("recover-failed-report-migrations: aborting deploy —", error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
