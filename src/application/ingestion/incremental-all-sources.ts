import {
  existingListingDetailPayloads,
  existingListingPayloads,
} from "@/infrastructure/database/listing-write-repository";
import {
  assertManualSynchronizationNotThrottled,
  SynchronizationAlreadyRunningError,
} from "@/infrastructure/database/synchronization-state-repository";
import { BlocketUnofficialImporter } from "@/infrastructure/marketplaces/blocket-unofficial/importer";
import { BytbilImporter } from "@/infrastructure/marketplaces/bytbil/importer";
import { HedinImporter } from "@/infrastructure/marketplaces/hedin/importer";
import { WaykeImporter } from "@/infrastructure/marketplaces/wayke/importer";
import { synchronizeMarketplace } from "./synchronize-marketplace";
import type { MarketplaceImporter } from "./types";

export type SourceSyncOutcome = "completed" | "warning" | "busy" | "failed";

export interface AllSourcesIncrementalOptions {
  /** Restrict the run to these provider keys (in registry order). Omit for
   *  every registered source. */
  providers?: readonly string[];
  /** Per-source page ceiling. Incremental still stops early once a page is
   *  both fully known and older than the lookback window. */
  maximumPagesPerSource?: number;
  lookbackHours?: number;
  knownPageThreshold?: number;
  /** Apply the manual cooldown before each source (used by the UI button so a
   *  scripted double-click can't re-scrape back to back). */
  throttle?: boolean;
  onProgress?: (message: string) => void;
}

export interface AllSourcesIncrementalResult {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  removedCount: number;
  completedAt?: Date;
  perSource: { provider: string; outcome: SourceSyncOutcome }[];
}

/** Every registered source, in a deliberate order: the biggest marketplace
 *  first so its work is done even if a later source runs long. */
function buildImporters(providers?: readonly string[]): MarketplaceImporter[] {
  const all: MarketplaceImporter[] = [
    new BlocketUnofficialImporter(undefined, existingListingDetailPayloads),
    new WaykeImporter(undefined, existingListingPayloads),
    new BytbilImporter(undefined, existingListingPayloads),
    new HedinImporter(undefined, existingListingPayloads),
  ];
  if (!providers) return all;
  const wanted = new Set(providers);
  return all.filter((importer) => wanted.has(importer.provider));
}

/**
 * Runs an incremental sync for each registered source, one after another.
 * Each source takes its own per-provider lock, so the sequence never
 * self-collides; a single source failing or being throttled is recorded and
 * the rest still run. Never reconciles — new and changed ads only.
 */
export async function synchronizeAllSourcesIncrementally(
  options: AllSourcesIncrementalOptions = {},
): Promise<AllSourcesIncrementalResult> {
  const {
    providers,
    maximumPagesPerSource = 4,
    lookbackHours = 6,
    knownPageThreshold = 1,
    throttle = false,
    onProgress,
  } = options;

  const result: AllSourcesIncrementalResult = {
    createdCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    failedCount: 0,
    removedCount: 0,
    perSource: [],
  };

  for (const importer of buildImporters(providers)) {
    try {
      if (throttle) {
        await assertManualSynchronizationNotThrottled(importer.provider);
      }
      const run = await synchronizeMarketplace(importer, {
        mode: "incremental",
        incrementalLookbackHours: lookbackHours,
        incrementalKnownPageThreshold: knownPageThreshold,
        incrementalMaximumPages: maximumPagesPerSource,
        onProgress,
      });
      result.createdCount += run.createdCount;
      result.updatedCount += run.updatedCount;
      result.unchangedCount += run.unchangedCount;
      result.failedCount += run.failedCount;
      result.removedCount += run.removedCount ?? 0;
      if (run.completedAt) result.completedAt = run.completedAt;
      result.perSource.push({
        provider: importer.provider,
        outcome: run.failedCount > 0 ? "warning" : "completed",
      });
    } catch (error) {
      if (error instanceof SynchronizationAlreadyRunningError) {
        result.perSource.push({ provider: importer.provider, outcome: "busy" });
        continue;
      }
      result.perSource.push({ provider: importer.provider, outcome: "failed" });
      console.error(
        `Inkrementell synkronisering misslyckades för ${importer.provider}.`,
        error,
      );
    }
  }

  return result;
}
