import { NextResponse } from "next/server";
import { verifyBlocketListingSample } from "@/application/ingestion/verify-blocket-listings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const configured = Number.parseInt(process.env.BLOCKET_VERIFICATION_SAMPLE_SIZE ?? "300", 10);
    const result = await verifyBlocketListingSample(Number.isInteger(configured) ? configured : 300);
    return NextResponse.json({ status: "completed", ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
