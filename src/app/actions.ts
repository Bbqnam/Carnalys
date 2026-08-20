"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import {
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";

export interface ManualSynchronizationState {
  outcome: "idle" | "completed" | "warning" | "busy" | "forbidden" | "failed";
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  failedCount?: number;
  completedAt?: string;
  activeMode?: string;
}

async function isLocalDevelopmentRequest() {
  if (process.env.NODE_ENV === "production") return false;
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  return (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:") ||
    host === "[::1]" ||
    host.startsWith("[::1]:")
  );
}

export async function synchronizeLatestListings(
  _previousState: ManualSynchronizationState,
): Promise<ManualSynchronizationState> {
  void _previousState;
  if (!(await isLocalDevelopmentRequest())) {
    return { outcome: "forbidden" };
  }

  try {
    const result = await synchronizeMarketplace(
      new BlocketUnofficialImporter(),
      { mode: "incremental" },
    );
    revalidatePath("/");
    return {
      outcome: result.failedCount > 0 ? "warning" : "completed",
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
      failedCount: result.failedCount,
      completedAt: result.completedAt?.toISOString(),
    };
  } catch (error) {
    if (error instanceof SynchronizationAlreadyRunningError) {
      return { outcome: "busy", activeMode: error.mode };
    }
    console.error("Manuell inkrementell synkronisering misslyckades.", error);
    return { outcome: "failed" };
  }
}
