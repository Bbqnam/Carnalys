import { NextResponse } from "next/server";
import { previousCompletedUtcDate } from "@/domain/market/historical-market";
import { buildMarketSnapshotsForDate } from "@/infrastructure/database/market-snapshot-repository";
import { initializeDatabase } from "@/infrastructure/database/prisma";

export const dynamic = "force-dynamic";
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
    const result = await buildMarketSnapshotsForDate(
      previousCompletedUtcDate(),
    );
    return NextResponse.json({
      status: "completed",
      snapshotDate: result.snapshotDate.toISOString().slice(0, 10),
      sourceWatermark: result.sourceWatermark.toISOString(),
      cohortCount: result.cohortCount,
      minimumCohortSize: result.minimumCohortSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
