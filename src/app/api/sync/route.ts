import { NextResponse } from "next/server";
import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import { initializeDatabase } from "@/infrastructure/database/prisma";
import { existingListingDetailPayloads } from "@/infrastructure/database/listing-write-repository";
import { SynchronizationAlreadyRunningError } from "@/infrastructure/database/synchronization-state-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";

export const dynamic = "force-dynamic";
// Detail data is only fetched live for genuinely new listings (known,
// already-enriched ones reuse cached data — see
// BlocketUnofficialImporter's knownDetailLookup), so steady-state pages
// are fast again. 300s gives headroom on plans that support it for pages
// with an unusually high number of new listings; Hobby still hard-caps at
// 60s regardless of this value.
export const maxDuration = 300;

function environmentInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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
      {
        mode: "incremental",
        incrementalLookbackHours: environmentInteger(
          "BLOCKET_INCREMENTAL_LOOKBACK_HOURS",
          72,
        ),
        incrementalMaximumPages: environmentInteger(
          "BLOCKET_INCREMENTAL_MAX_PAGES",
          10,
        ),
        incrementalKnownPageThreshold: environmentInteger(
          "BLOCKET_INCREMENTAL_KNOWN_PAGES",
          2,
        ),
        analysisRefreshLimit: environmentInteger("SYNC_ANALYSIS_REFRESH_LIMIT", 250),
      },
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
