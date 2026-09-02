"use server";

import { requireAdmin } from "@/features/auth/session";
import { buildDailyMarketReport } from "@/application/reporting/daily-market-report";
import { sendDailyMarketEmail } from "@/application/reporting/daily-market-email";
import { verifyBlocketListingSample } from "@/application/ingestion/verify-blocket-listings";
import { revalidatePath } from "next/cache";

export type ResendReportState = { success?: boolean; error?: string };
export type VerifyBlocketState = {
  success?: boolean;
  error?: string;
  checked?: number;
  missing?: number;
  inconclusive?: number;
};

export async function verifyBlocketNowAction(
  _state: VerifyBlocketState,
  _formData: FormData,
): Promise<VerifyBlocketState> {
  try {
    await requireAdmin();
    const result = await verifyBlocketListingSample(300);
    revalidatePath("/admin/market-report");
    return { success: true, checked: result.checked, missing: result.missing, inconclusive: result.inconclusive };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Blocket check could not run." };
  }
}

export async function resendDailyReportAction(
  _state: ResendReportState,
  _formData: FormData,
): Promise<ResendReportState> {
  try {
    await requireAdmin();
    const report = await buildDailyMarketReport(new Date(), 0);
    await sendDailyMarketEmail(report);
    return { success: true };
  } catch (error) {
    if (error instanceof Error && (error.message === "AUTH_REQUIRED" || error.message === "ADMIN_REQUIRED")) {
      return { error: "Administrator access required." };
    }
    return { error: error instanceof Error ? error.message : "The report could not be sent." };
  }
}
