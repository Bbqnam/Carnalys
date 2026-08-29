import "dotenv/config";

import { synchronizeMarketplace } from "@/application/ingestion/synchronize-marketplace";
import type { SynchronizationMode } from "@/application/ingestion/types";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import {
  NoResumableSynchronizationError,
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import {
  existingListingDetailPayloads,
  existingListingPayloads,
} from "@/infrastructure/database/listing-write-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";
import { WaykeImporter } from "@/infrastructure/marketplaces/wayke/importer";
import { BytbilImporter } from "@/infrastructure/marketplaces/bytbil/importer";
import { HedinImporter } from "@/infrastructure/marketplaces/hedin/importer";

function environmentInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const command = process.argv[2] ?? "incremental";
const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
const source = sourceArgument?.split("=", 2)[1] ?? "blocket";
if (source !== "blocket" && source !== "wayke" && source !== "bytbil" && source !== "hedin") {
  throw new Error(`Okänd källa: ${source}. Välj blocket, wayke, bytbil eller hedin.`);
}
const watch = command === "watch" || process.argv.includes("--watch");
if (watch && source !== "blocket") {
  throw new Error(
    "Endast Blocket har watcher-läge. Kör en avgränsad synkronisering för övriga källor.",
  );
}
const mode: SynchronizationMode =
  command === "full" || command === "resume" ? "reconciliation" : "incremental";
const resumeOnly = command === "resume";
let stopping = false;

process.once("SIGINT", () => {
  stopping = true;
  console.log("Stoppar efter den pågående sidan har sparats…");
});
process.once("SIGTERM", () => {
  stopping = true;
});

async function runOnce() {
  console.log(
    mode === "reconciliation"
      ? resumeOnly
        ? "Återupptar avbruten full synkronisering…"
        : "Startar eller återupptar full synkronisering…"
      : "Hämtar de senaste fordonsannonserna…",
  );
  const importer =
    source === "wayke"
      ? new WaykeImporter(undefined, existingListingPayloads)
      : source === "bytbil"
        ? new BytbilImporter(undefined, existingListingPayloads)
        : source === "hedin"
          ? new HedinImporter(undefined, existingListingPayloads)
          : new BlocketUnofficialImporter(undefined, existingListingDetailPayloads);
  const envPrefix =
    source === "wayke"
      ? "WAYKE"
      : source === "bytbil"
        ? "BYTBIL"
        : source === "hedin"
          ? "HEDIN"
          : "BLOCKET";
  const maxPagesEnv = `${envPrefix}_INCREMENTAL_MAX_PAGES`;
  const knownPagesEnv = `${envPrefix}_INCREMENTAL_KNOWN_PAGES`;
  const result = await synchronizeMarketplace(importer, {
    mode,
    resumeOnly,
    incrementalLookbackHours: environmentInteger(
      "BLOCKET_INCREMENTAL_LOOKBACK_HOURS",
      72,
    ),
    incrementalMaximumPages: process.argv.includes("--sample")
      ? 1
      : environmentInteger(maxPagesEnv, source === "blocket" ? 40 : 20),
    incrementalKnownPageThreshold: environmentInteger(knownPagesEnv, 2),
    analysisRefreshLimit: environmentInteger("SYNC_ANALYSIS_REFRESH_LIMIT", 250),
    onProgress: console.log,
    shouldStop: () => stopping,
  });

  console.log(
    `Körning ${result.id} klar: ${result.createdCount} nya, ${result.updatedCount} ändrade, ${result.unchangedCount} oförändrade, ${result.failedCount} avvisade och ${result.removedCount} borttagna. Stopporsak: ${result.stopReason ?? "okänd"}.`,
  );
}

async function waitForNextRun(milliseconds: number) {
  const pollMilliseconds = Math.min(milliseconds, 30_000);
  let remaining = milliseconds;
  while (!stopping && remaining > 0) {
    const delay = Math.min(pollMilliseconds, remaining);
    await new Promise((resolve) => setTimeout(resolve, delay));
    remaining -= delay;
  }
}

async function main() {
  await initializeDatabase();
  if (!watch) {
    await runOnce();
    return;
  }

  const intervalMinutes = environmentInteger(
    "DATA_SYNC_WATCH_INTERVAL_MINUTES",
    15,
  );
  console.log(`Automatisk synkronisering kör var ${intervalMinutes}:e minut.`);
  while (!stopping) {
    try {
      await runOnce();
    } catch (error) {
      if (error instanceof SynchronizationAlreadyRunningError) {
        console.warn(error.message);
      } else {
        console.error(
          "Synkroniseringen misslyckades. Befintlig katalog används vidare.",
          error,
        );
      }
    }
    if (!stopping) {
      await waitForNextRun(intervalMinutes * 60 * 1_000);
    }
  }
}

main()
  .catch((error: unknown) => {
    if (
      error instanceof SynchronizationAlreadyRunningError ||
      error instanceof NoResumableSynchronizationError
    ) {
      console.error(error.message);
    } else {
      console.error(
        "Synkroniseringen misslyckades. Befintlig katalog används vidare.",
        error,
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
