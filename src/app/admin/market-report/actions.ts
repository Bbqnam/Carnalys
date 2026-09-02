"use server";

import { requireAdmin } from "@/features/auth/session";
import { buildDailyMarketReport } from "@/application/reporting/daily-market-report";
import { sendDailyMarketEmail } from "@/application/reporting/daily-market-email";
import {
  verifyBlocketListingSample,
  type BlocketVerificationResult,
} from "@/application/ingestion/verify-blocket-listings";
import { revalidatePath } from "next/cache";

export type ResendReportState = { success?: boolean; error?: string; disabled?: boolean };

export type VerifyBlocketSummary = Pick<
  BlocketVerificationResult,
  | "checked"
  | "active"
  | "missing"
  | "inconclusive"
  | "neverCheckedInSample"
  | "newlyRemoved"
  | "newDisappearances"
  | "candidatesAvailable"
  | "oldestListingAgeDays"
  | "newestListingAgeDays"
  | "medianListingAgeDays"
  | "dealerListings"
  | "privateListings"
  | "durationMs"
  | "sampleTooRecent"
  | "warnings"
> & { completedAt: string };

export type VerifyBlocketState = { success?: boolean; error?: string; result?: VerifyBlocketSummary };

function sampleSize() {
  const parsed = Number.parseInt(process.env.BLOCKET_VERIFICATION_SAMPLE_SIZE ?? "300", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 300;
}

export async function verifyBlocketNowAction(
  _state: VerifyBlocketState,
  _formData: FormData,
): Promise<VerifyBlocketState> {
  try {
    await requireAdmin();
    const result = await verifyBlocketListingSample(sampleSize());
    revalidatePath("/admin/market-report");
    return {
      success: true,
      result: {
        checked: result.checked,
        active: result.active,
        missing: result.missing,
        inconclusive: result.inconclusive,
        neverCheckedInSample: result.neverCheckedInSample,
        newlyRemoved: result.newlyRemoved,
        newDisappearances: result.newDisappearances,
        candidatesAvailable: result.candidatesAvailable,
        oldestListingAgeDays: result.oldestListingAgeDays,
        newestListingAgeDays: result.newestListingAgeDays,
        medianListingAgeDays: result.medianListingAgeDays,
        dealerListings: result.dealerListings,
        privateListings: result.privateListings,
        durationMs: result.durationMs,
        sampleTooRecent: result.sampleTooRecent,
        warnings: result.warnings,
        completedAt: result.completedAt.toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof Error && (error.message === "AUTH_REQUIRED" || error.message === "ADMIN_REQUIRED")) {
      return { error: "Administrator access required." };
    }
    return { error: error instanceof Error ? error.message : "The Blocket check could not run." };
  }
}

export async function resendDailyReportAction(
  _state: ResendReportState,
  _formData: FormData,
): Promise<ResendReportState> {
  try {
    await requireAdmin();
    if (!process.env.RESEND_API_KEY || !process.env.DAILY_REPORT_FROM || !process.env.DAILY_REPORT_TO) {
      return {
        disabled: true,
        error:
          "Email delivery is not configured yet. Set RESEND_API_KEY, DAILY_REPORT_FROM and DAILY_REPORT_TO to enable the morning report and this button.",
      };
    }
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
