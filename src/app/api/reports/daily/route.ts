import { NextResponse } from "next/server";
import { buildDailyMarketReport, isStockholmDeliveryHour } from "@/application/reporting/daily-market-report";
import { sendDailyMarketEmail } from "@/application/reporting/daily-market-email";
import { initializeDatabase } from "@/infrastructure/database/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("force") !== "1" && !isStockholmDeliveryHour()) {
    return NextResponse.json({ status: "skipped", reason: "Not 08:00 in Europe/Stockholm" });
  }
  try {
    await initializeDatabase();
    const report = await buildDailyMarketReport();
    const delivery = await sendDailyMarketEmail(report);
    return NextResponse.json({ status: "sent", reportDate: report.reportDate, messageId: delivery.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
