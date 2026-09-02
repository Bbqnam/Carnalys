import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyBlocketListingSample,
  type AvailabilityClient,
  type VerificationDb,
} from "./verify-blocket-listings";
import type { BlocketAvailability } from "@/infrastructure/marketplaces/blocket-unofficial/availability";

const DAY_MS = 24 * 60 * 60 * 1000;

type ListingRow = {
  id: string;
  externalId: string;
  priceAmount: number;
  previousPriceAmount: number | null;
  mileageKm: number;
  sellerType: string;
  vehicleId: string;
  status: string;
  removedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  availabilityCheckedAt: Date | null;
  availabilityCheckStatus: string | null;
  missingReconciliationCount: number;
};

type ObservationRow = {
  id: bigint;
  listingId: string;
  kind: string;
  priceAmount: number;
  previousPriceAmount: number | null;
  mileageKm: number;
  sellerType: string;
  observedAt: Date;
  status: string;
};

function listing(overrides: Partial<ListingRow> & { id: string }): ListingRow {
  const base = new Date("2026-08-01T00:00:00Z");
  return {
    externalId: overrides.id,
    priceAmount: 150_000,
    previousPriceAmount: null,
    mileageKm: 90_000,
    sellerType: "private",
    vehicleId: `v-${overrides.id}`,
    status: "active",
    removedAt: null,
    firstSeenAt: base,
    lastSeenAt: base,
    availabilityCheckedAt: null,
    availabilityCheckStatus: null,
    missingReconciliationCount: 0,
    ...overrides,
  };
}

class FakeDb implements VerificationDb {
  observations: ObservationRow[] = [];
  private nextObservationId = BigInt(1);
  constructor(public rows: ListingRow[]) {}

  listingRecord = {
    findMany: async (): Promise<never> => {
      throw new Error("unused");
    },
    updateMany: async (args: unknown) => {
      const { where, data } = args as {
        where: { id: string; status?: string };
        data: Partial<ListingRow>;
      };
      let count = 0;
      for (const row of this.rows) {
        if (row.id !== where.id) continue;
        if (where.status && row.status !== where.status) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };

  // The runner calls db.listingRecord.findMany directly; override per-test.
  setCandidates(select: () => ListingRow[]) {
    this.listingRecord.findMany = async () =>
      select().map((row) => ({
        id: row.id,
        externalId: row.externalId,
        priceAmount: row.priceAmount,
        previousPriceAmount: row.previousPriceAmount,
        mileageKm: row.mileageKm,
        sellerType: row.sellerType,
        vehicleId: row.vehicleId,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        availabilityCheckedAt: row.availabilityCheckedAt,
      })) as never;
  }

  $transaction = async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
    const tx = {
      listingRecord: {
        findUnique: async (args: unknown) => {
          const { where } = args as { where: { id: string } };
          const row = this.rows.find((r) => r.id === where.id);
          return row ? { status: row.status, removedAt: row.removedAt } : null;
        },
        update: async (args: unknown) => {
          const { where, data } = args as { where: { id: string }; data: Partial<ListingRow> };
          const row = this.rows.find((r) => r.id === where.id);
          if (row) Object.assign(row, data);
          return row;
        },
      },
      listingObservation: {
        findFirst: async (args: unknown) => {
          const { where } = args as { where: { listingId: string; kind: string } };
          const found = this.observations.find(
            (o) => o.listingId === where.listingId && o.kind === where.kind,
          );
          return found ? { id: found.id } : null;
        },
        createMany: async (args: unknown) => {
          const { data } = args as { data: Omit<ObservationRow, "id">[] };
          let count = 0;
          for (const entry of data) {
            const duplicate = this.observations.some(
              (o) =>
                o.listingId === entry.listingId &&
                o.kind === entry.kind &&
                o.observedAt.getTime() === entry.observedAt.getTime(),
            );
            if (duplicate) continue;
            this.observations.push({ ...entry, id: this.nextObservationId++ });
            count += 1;
          }
          return { count };
        },
      },
    };
    return fn(tx as never);
  };
}

function fixedClient(map: Record<string, BlocketAvailability>): AvailabilityClient {
  return { checkCarAvailability: async (id) => map[id] ?? "inconclusive" };
}

const NOW = new Date("2026-09-02T09:00:00Z");
const old = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

test("a confirmed missing listing becomes removed with a disappeared observation", async () => {
  const rows = [listing({ id: "100", priceAmount: 189_000, mileageKm: 82_000, sellerType: "dealer", firstSeenAt: old(40), lastSeenAt: old(9) })];
  const db = new FakeDb(rows);
  db.setCandidates(() => rows);
  const result = await verifyBlocketListingSample({
    db,
    client: fixedClient({ "100": "missing" }),
    now: () => NOW,
    concurrency: 1,
  });

  assert.equal(rows[0].status, "removed");
  assert.equal(rows[0].removedAt?.getTime(), NOW.getTime());
  assert.equal(rows[0].availabilityCheckStatus, "missing");
  assert.equal(rows[0].availabilityCheckedAt?.getTime(), NOW.getTime());
  assert.equal(db.observations.length, 1);
  assert.equal(db.observations[0].kind, "disappeared");
  assert.equal(result.missing, 1);
  assert.equal(result.newlyRemoved, 1);
  assert.equal(result.newDisappearances, 1);
});

test("the final asking price and seller data are preserved on the observation", async () => {
  const rows = [
    listing({ id: "101", priceAmount: 244_900, previousPriceAmount: 259_000, mileageKm: 71_500, sellerType: "dealer", firstSeenAt: old(50), lastSeenAt: old(12) }),
  ];
  const db = new FakeDb(rows);
  db.setCandidates(() => rows);
  await verifyBlocketListingSample({ db, client: fixedClient({ "101": "missing" }), now: () => NOW, concurrency: 1 });

  assert.equal(db.observations[0].priceAmount, 244_900);
  assert.equal(db.observations[0].previousPriceAmount, 259_000);
  assert.equal(db.observations[0].mileageKm, 71_500);
  assert.equal(db.observations[0].sellerType, "dealer");
  assert.equal(db.observations[0].status, "removed");
});

test("re-checking an already-removed listing creates no duplicate history", async () => {
  const rows = [listing({ id: "102", firstSeenAt: old(60), lastSeenAt: old(20) })];
  const db = new FakeDb(rows);
  db.setCandidates(() => rows.filter((r) => r.status === "active"));

  const first = await verifyBlocketListingSample({ db, client: fixedClient({ "102": "missing" }), now: () => NOW, concurrency: 1 });
  assert.equal(first.newDisappearances, 1);
  assert.equal(db.observations.length, 1);

  // The listing is no longer active, so it is not even re-sampled; force it
  // back into the candidate set to prove the transaction guard holds.
  db.setCandidates(() => rows);
  const second = await verifyBlocketListingSample({
    db,
    client: fixedClient({ "102": "missing" }),
    now: () => new Date(NOW.getTime() + DAY_MS),
    concurrency: 1,
  });
  assert.equal(db.observations.length, 1, "no second disappeared row");
  assert.equal(second.newlyRemoved, 0);
  assert.equal(second.newDisappearances, 0);
});

test("active and inconclusive results only stamp the check status", async () => {
  const rows = [
    listing({ id: "200", firstSeenAt: old(30), lastSeenAt: old(10) }),
    listing({ id: "201", firstSeenAt: old(30), lastSeenAt: old(10) }),
  ];
  const db = new FakeDb(rows);
  db.setCandidates(() => rows);
  const result = await verifyBlocketListingSample({
    db,
    client: fixedClient({ "200": "active", "201": "inconclusive" }),
    now: () => NOW,
    concurrency: 1,
  });

  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].availabilityCheckStatus, "active");
  assert.equal(rows[1].status, "active");
  assert.equal(rows[1].availabilityCheckStatus, "inconclusive");
  assert.equal(db.observations.length, 0);
  assert.equal(result.active, 1);
  assert.equal(result.inconclusive, 1);
  assert.equal(result.missing, 0);
});

test("telemetry reports sample age, never-checked count and a too-recent warning", async () => {
  const rows = [
    listing({ id: "300", firstSeenAt: old(2), lastSeenAt: old(1), availabilityCheckedAt: null }),
    listing({ id: "301", firstSeenAt: old(4), lastSeenAt: old(1), availabilityCheckedAt: old(3) }),
    listing({ id: "302", firstSeenAt: old(6), lastSeenAt: old(1), availabilityCheckedAt: null }),
  ];
  const db = new FakeDb(rows);
  db.setCandidates(() => rows);
  const result = await verifyBlocketListingSample({
    db,
    client: fixedClient({ "300": "active", "301": "active", "302": "active" }),
    now: () => NOW,
    concurrency: 3,
  });

  assert.equal(result.checked, 3);
  assert.equal(result.neverCheckedInSample, 2);
  assert.equal(result.oldestListingAgeDays, 6);
  assert.equal(result.newestListingAgeDays, 2);
  assert.equal(result.sampleTooRecent, true);
  assert.ok(result.warnings.some((w) => w.includes("only 6 days old")));
  assert.ok(result.completedAt instanceof Date);
});

test("a healthy older sample raises no too-recent warning", async () => {
  const rows = Array.from({ length: 5 }, (_, i) =>
    listing({ id: `40${i}`, firstSeenAt: old(45 + i), lastSeenAt: old(6 + i), availabilityCheckedAt: old(5) }),
  );
  const db = new FakeDb(rows);
  db.setCandidates(() => rows);
  const result = await verifyBlocketListingSample({
    db,
    client: fixedClient(Object.fromEntries(rows.map((r) => [r.id, "active" as const]))),
    now: () => NOW,
    concurrency: 2,
  });
  assert.equal(result.sampleTooRecent, false);
  assert.ok(!result.warnings.some((w) => w.includes("days old")));
});
