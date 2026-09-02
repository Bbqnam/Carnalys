import { NextResponse } from "next/server";
import { buildDailyMarketReport, isStockholmDeliveryHour } from "@/application/reporting/daily-market-report";
import { sendDailyMarketEmail } from "@/application/reporting/daily-market-email";
import { initializeDatabase } from "@/infrastructure/database/prisma";
import { isCronAuthorized } from "@/infrastructure/http/cron-authorization";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("force") !== "1" && !isStockholmDeliveryHour()) {
    return NextResponse.json({ status: "skipped", reason: "Not 08:00 in Europe/Stockholm" });
  }
  if (!process.env.RESEND_API_KEY || !process.env.DAILY_REPORT_FROM || !process.env.DAILY_REPORT_TO) {
    // Email is not wired up yet — the admin page still works without it, so the
    // cron simply no-ops instead of failing.
    return NextResponse.json({ status: "skipped", reason: "Email delivery is not configured" });
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
