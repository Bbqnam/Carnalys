import { NextResponse } from "next/server";
import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import { initializeDatabase } from "@/infrastructure/database/prisma";
import { existingListingDetailPayloads } from "@/infrastructure/database/listing-write-repository";
import { SynchronizationAlreadyRunningError } from "@/infrastructure/database/synchronization-state-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";

export const dynamic = "force-dynamic";
// Full "reconciliation" sync: walks the entire catalog (partitioned by
// year/price/mileage) rather than just the newest pages, so it's the only
// thing that ever backfills older/thin listings or detects sold/removed
// ones. A single run essentially never finishes within one invocation, but
// it doesn't need to — synchronizeMarketplace resumes an interrupted
// reconciliation run from its last checkpoint automatically, so each
// nightly tick just continues where the previous one left off. Vercel kills
// the function at maxDuration (Hobby hard-caps at 60s regardless of this
// value) without giving the run a chance to mark itself "interrupted", but
// the synchronization lock has its own stale-heartbeat recovery (5 minutes)
// that reclaims it for the next run either way.
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initializeDatabase();

  try {
    const result = await synchronizeMarketplace(
      new BlocketUnofficialImporter(undefined, existingListingDetailPayloads),
      { mode: "reconciliation" },
    );

    return NextResponse.json({
      status: "completed",
      runId: result.id,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
      failedCount: result.failedCount,
      removedCount: result.removedCount,
      stopReason: result.stopReason,
    });
  } catch (error) {
    if (error instanceof SynchronizationAlreadyRunningError) {
      return NextResponse.json({ status: "skipped", reason: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
