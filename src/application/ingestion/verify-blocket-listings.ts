import { BlocketUnofficialClient } from "@/infrastructure/marketplaces/blocket-unofficial/client";
import type { BlocketAvailability } from "@/infrastructure/marketplaces/blocket-unofficial/availability";

const provider = "blocket_unofficial";
const DAY_MS = 24 * 60 * 60 * 1000;

// A sample whose oldest listing is younger than this cannot yet say much about
// daily removals: a car that has only been advertised for a few days has had no
// real chance to sell or be withdrawn.
const MIN_MEANINGFUL_OLDEST_AGE_DAYS = 7;

export type BlocketVerificationResult = {
  checked: number;
  active: number;
  missing: number;
  inconclusive: number;
  /** Listings in the sample that had never had a direct availability check. */
  neverCheckedInSample: number;
  /** Listings flipped active -> removed by this run. */
  newlyRemoved: number;
  /** `disappeared` observations created by this run. */
  newDisappearances: number;
  sampleSize: number;
  candidatesAvailable: number;
  dealerListings: number;
  privateListings: number;
  oldestListingAgeDays: number | null;
  newestListingAgeDays: number | null;
  medianListingAgeDays: number | null;
  oldestPreviousCheckAt: Date | null;
  newestPreviousCheckAt: Date | null;
  seenWithinLast24h: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  /** True when the sample is too fresh / unsuitable to estimate daily removals. */
  sampleTooRecent: boolean;
  warnings: string[];
  removedListingIds: string[];
};

type Candidate = {
  id: string;
  externalId: string;
  priceAmount: number;
  previousPriceAmount: number | null;
  mileageKm: number;
  sellerType: string;
  vehicleId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  availabilityCheckedAt: Date | null;
};

export interface AvailabilityClient {
  checkCarAvailability(id: string): Promise<BlocketAvailability>;
}

export interface VerificationDb {
  listingRecord: {
    findMany(args: unknown): Promise<Candidate[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  $transaction<T>(fn: (tx: VerificationTx) => Promise<T>): Promise<T>;
}

export interface VerificationTx {
  listingRecord: {
    findUnique(args: unknown): Promise<{ status: string; removedAt: Date | null } | null>;
    update(args: unknown): Promise<unknown>;
  };
  listingObservation: {
    findFirst(args: unknown): Promise<{ id: bigint } | null>;
    createMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface VerifyBlocketOptions {
  sampleSize?: number;
  db?: VerificationDb;
  client?: AvailabilityClient;
  now?: () => Date;
  concurrency?: number;
}

// Loaded lazily so this module (and its tests) can be imported without a
// configured DATABASE_URL when a database is injected.
async function loadDefaultDatabase(): Promise<VerificationDb> {
  const { prisma, initializeDatabase } = await import("@/infrastructure/database/prisma");
  await initializeDatabase();
  return prisma as unknown as VerificationDb;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function verifyBlocketListingSample(
  sampleSizeOrOptions: number | VerifyBlocketOptions = 300,
): Promise<BlocketVerificationResult> {
  const options: VerifyBlocketOptions =
    typeof sampleSizeOrOptions === "number"
      ? { sampleSize: sampleSizeOrOptions }
      : sampleSizeOrOptions;

  const db = options.db ?? (await loadDefaultDatabase());
  const client = options.client ?? new BlocketUnofficialClient();
  const now = options.now ?? (() => new Date());
  const sampleSize = Math.max(1, Math.min(options.sampleSize ?? 300, 500));

  // Selection priority (see docs/DATA_INGESTION.md):
  //   1. listings that have never had a direct availability check
  //   2. listings whose last direct check is the oldest
  //   3. listings the reconciler already failed to re-find (strong removal
  //      signal) and that were least recently seen in an import
  // This deliberately rotates: a listing checked in this run sorts to the back
  // of the queue next time, so older unchecked listings are never starved by
  // recently-confirmed ones.
  const candidates: Candidate[] = await db.listingRecord.findMany({
    where: { provider, status: "active" },
    orderBy: [
      { availabilityCheckedAt: { sort: "asc", nulls: "first" } },
      { missingReconciliationCount: "desc" },
      { lastSeenAt: "asc" },
    ],
    take: sampleSize,
    select: {
      id: true,
      externalId: true,
      priceAmount: true,
      previousPriceAmount: true,
      mileageKm: true,
      sellerType: true,
      vehicleId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      availabilityCheckedAt: true,
    },
  });

  const startedAt = now();
  const result: BlocketVerificationResult = {
    checked: 0,
    active: 0,
    missing: 0,
    inconclusive: 0,
    neverCheckedInSample: candidates.filter((c) => c.availabilityCheckedAt == null).length,
    newlyRemoved: 0,
    newDisappearances: 0,
    sampleSize,
    candidatesAvailable: candidates.length,
    dealerListings: candidates.filter((c) => c.sellerType !== "private").length,
    privateListings: candidates.filter((c) => c.sellerType === "private").length,
    oldestListingAgeDays: null,
    newestListingAgeDays: null,
    medianListingAgeDays: null,
    oldestPreviousCheckAt: null,
    newestPreviousCheckAt: null,
    seenWithinLast24h: 0,
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    sampleTooRecent: false,
    warnings: [],
    removedListingIds: [],
  };

  if (candidates.length > 0) {
    const ageDays = candidates.map((c) => (startedAt.getTime() - c.firstSeenAt.getTime()) / DAY_MS);
    result.oldestListingAgeDays = Math.round(Math.max(...ageDays) * 10) / 10;
    result.newestListingAgeDays = Math.round(Math.min(...ageDays) * 10) / 10;
    result.medianListingAgeDays = Math.round((median(ageDays) ?? 0) * 10) / 10;
    result.seenWithinLast24h = candidates.filter(
      (c) => startedAt.getTime() - c.lastSeenAt.getTime() < DAY_MS,
    ).length;
    const previousChecks = candidates
      .map((c) => c.availabilityCheckedAt)
      .filter((value): value is Date => value != null)
      .sort((a, b) => a.getTime() - b.getTime());
    result.oldestPreviousCheckAt = previousChecks[0] ?? null;
    result.newestPreviousCheckAt = previousChecks[previousChecks.length - 1] ?? null;
  }

  let nextIndex = 0;
  async function runLane() {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex++];
      const checkedAt = now();
      let availability: BlocketAvailability;
      try {
        availability = await client.checkCarAvailability(candidate.externalId);
      } catch {
        availability = "inconclusive";
      }
      result.checked += 1;

      if (availability === "active" || availability === "inconclusive") {
        if (availability === "active") result.active += 1;
        else result.inconclusive += 1;
        await db.listingRecord.updateMany({
          where: { id: candidate.id, status: "active" },
          data: { availabilityCheckedAt: checkedAt, availabilityCheckStatus: availability },
        });
        continue;
      }

      // availability === "missing": record the removal atomically.
      result.missing += 1;
      const outcome = await db.$transaction(async (transaction) => {
        const current = await transaction.listingRecord.findUnique({
          where: { id: candidate.id },
          select: { status: true, removedAt: true },
        });
        const wasActive = current?.status === "active";
        await transaction.listingRecord.update({
          where: { id: candidate.id },
          data: {
            status: "removed",
            // Keep the first removal time if the listing was already removed.
            removedAt: current?.removedAt ?? checkedAt,
            availabilityCheckedAt: checkedAt,
            availabilityCheckStatus: "missing",
          },
        });
        const existing = await transaction.listingObservation.findFirst({
          where: { listingId: candidate.id, kind: "disappeared" },
          select: { id: true },
        });
        let observationCreated = false;
        if (!existing) {
          const created = await transaction.listingObservation.createMany({
            data: [
              {
                listingId: candidate.id,
                provider,
                observedAt: checkedAt,
                kind: "disappeared",
                priceAmount: candidate.priceAmount,
                previousPriceAmount: candidate.previousPriceAmount,
                mileageKm: candidate.mileageKm,
                sellerType: candidate.sellerType,
                status: "removed",
              },
            ],
            skipDuplicates: true,
          });
          observationCreated = created.count > 0;
        }
        return { wasActive, observationCreated };
      });
      if (outcome.wasActive) {
        result.newlyRemoved += 1;
        result.removedListingIds.push(candidate.id);
      }
      if (outcome.observationCreated) result.newDisappearances += 1;
    }
  }

  const lanes = Math.max(1, Math.min(options.concurrency ?? 12, candidates.length || 1));
  await Promise.all(Array.from({ length: lanes }, () => runLane()));

  const completedAt = now();
  result.completedAt = completedAt;
  result.durationMs = completedAt.getTime() - startedAt.getTime();

  // Warnings — surfaced verbatim in the admin UI and the report.
  const warnings: string[] = [];
  if (candidates.length === 0) {
    warnings.push("No active Blocket listings were available to check.");
  } else {
    if (candidates.length < sampleSize) {
      warnings.push(
        `Only ${candidates.length} active Blocket listings were available, fewer than the requested ${sampleSize}.`,
      );
    }
    if ((result.oldestListingAgeDays ?? 0) < MIN_MEANINGFUL_OLDEST_AGE_DAYS) {
      result.sampleTooRecent = true;
      warnings.push(
        `The oldest listing in this sample is only ${result.oldestListingAgeDays} days old, so a low "missing" count does not yet estimate daily removals.`,
      );
    }
    if (result.seenWithinLast24h === candidates.length) {
      result.sampleTooRecent = true;
      warnings.push(
        "Every sampled listing was re-seen by an import in the last 24 hours, which makes it a weak sample for detecting removals.",
      );
    }
    if (result.checked > 0 && result.inconclusive / result.checked > 0.3) {
      warnings.push(
        `${result.inconclusive} of ${result.checked} checks were inconclusive; the availability service may be rate-limiting or degraded.`,
      );
    }
    if (result.checked > 0 && result.neverCheckedInSample === 0) {
      warnings.push(
        "Every listing in this sample had been checked before; unchecked older inventory may be going unseen — raise BLOCKET_VERIFICATION_SAMPLE_SIZE or check more often.",
      );
    }
  }
  result.warnings = warnings;

  return result;
}
