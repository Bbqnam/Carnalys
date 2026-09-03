import assert from "node:assert/strict";
import test from "node:test";
import { summarizeExactListingHistory } from "./history";

test("exact listing history preserves recorded price and mileage changes", () => {
  const history = summarizeExactListingHistory({
    firstSeenAt: new Date("2026-08-20T10:00:00Z"),
    lastSeenAt: new Date("2026-09-01T10:00:00Z"),
    status: "active",
    observations: [
      { observedAt: new Date("2026-08-20T10:00:00Z"), kind: "first_seen", priceAmount: 200_000, previousPriceAmount: null, mileageKm: 50_000, previousMileageKm: null, status: "active", provenance: "observed" },
      { observedAt: new Date("2026-08-25T10:00:00Z"), kind: "price_change", priceAmount: 190_000, previousPriceAmount: 200_000, mileageKm: 50_000, previousMileageKm: null, status: "active", provenance: "observed" },
      { observedAt: new Date("2026-09-01T10:00:00Z"), kind: "mileage_change", priceAmount: 190_000, previousPriceAmount: null, mileageKm: 51_000, previousMileageKm: 50_000, status: "active", provenance: "observed" },
    ],
  });
  assert.deepEqual(history.priceChanges[0], { observedAt: "2026-08-25T10:00:00.000Z", fromAmount: 200_000, toAmount: 190_000, direction: "decrease" });
  assert.equal(history.mileageChanges[0].fromKm, 50_000);
  assert.equal(history.mileageChanges[0].toKm, 51_000);
});

test("a disappearance is never reported as a confirmed sale", () => {
  const history = summarizeExactListingHistory({
    firstSeenAt: new Date("2026-08-20T10:00:00Z"),
    lastSeenAt: new Date("2026-08-25T10:00:00Z"),
    status: "removed",
    observations: [{ observedAt: new Date("2026-08-25T10:00:00Z"), kind: "disappeared", priceAmount: 190_000, previousPriceAmount: null, mileageKm: 50_000, previousMileageKm: null, status: "removed", provenance: "observed" }],
  });
  assert.match(history.lifecycle[0].statement, /does not confirm a sale/i);
  assert.doesNotMatch(history.lifecycle[0].statement, /sold for/i);
  assert.match(history.warnings.join(" "), /not evidence.*sold/i);
});

