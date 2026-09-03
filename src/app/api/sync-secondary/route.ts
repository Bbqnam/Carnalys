import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { synchronizeAllSourcesIncrementally } from "@/application/ingestion/incremental-all-sources";
import { marketAnalysisCacheTag } from "@/infrastructure/database/market-analysis-repository";
import { catalogCountCacheTag } from "@/infrastructure/database/vehicle-listing-repository";
import { initializeDatabase } from "@/infrastructure/database/prisma";

export const dynamic = "force-dynamic";
// Runs the non-Blocket sources incrementally, one after another. Kept off the
// /api/sync invocation so Blocket's daily walk never shares a function's time
// budget with three more network-bound scrapes. 300s on plans that allow it;
// each source also stops early once a page is fully known and past lookback.
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
    const result = await synchronizeAllSourcesIncrementally({
      providers: ["wayke", "bytbil", "hedin", "autohero"],
      maximumPagesPerSource: environmentInteger("SECONDARY_INCREMENTAL_MAX_PAGES", 8),
      lookbackHours: environmentInteger("SECONDARY_INCREMENTAL_LOOKBACK_HOURS", 72),
      knownPageThreshold: environmentInteger("SECONDARY_INCREMENTAL_KNOWN_PAGES", 2),
    });

    // Fresh listings mean the Analysis page's cached aggregates are stale.
    revalidateTag(marketAnalysisCacheTag, "max");
    revalidateTag(catalogCountCacheTag, "max");

    return NextResponse.json({
      status: "completed",
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
      failedCount: result.failedCount,
      removedCount: result.removedCount,
      bySource: Object.fromEntries(
        result.perSource.map((source) => [source.provider, source.outcome]),
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
