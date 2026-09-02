"use server";

import { requireAdmin } from "@/features/auth/session";
import { buildDailyMarketReport } from "@/application/reporting/daily-market-report";
import { sendDailyMarketEmail } from "@/application/reporting/daily-market-email";

export type ResendReportState = { success?: boolean; error?: string };

export async function resendDailyReportAction(): Promise<ResendReportState> {
  try {
    await requireAdmin();
    const report = await buildDailyMarketReport();
    await sendDailyMarketEmail(report);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && (error.message === "AUTH_REQUIRED" || error.message === "ADMIN_REQUIRED")) {
      return { error: "Administrator access required." };
    }
    return { error: error instanceof Error ? error.message : "The report could not be sent." };
  }
}
