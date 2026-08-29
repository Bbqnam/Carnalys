import assert from "node:assert/strict";
import test from "node:test";
import { selectRepresentativeListings } from "./representative-listing-policy";

test("one newest listing represents an exactly matched physical vehicle", () => {
  const older = { id: "blocket", vehicleId: "car-1", synchronizedAt: new Date("2026-01-01") };
  const newer = { id: "wayke", vehicleId: "car-1", synchronizedAt: new Date("2026-01-02") };
  const other = { id: "other", vehicleId: "car-2", synchronizedAt: new Date("2026-01-01") };
  assert.deepEqual(selectRepresentativeListings([older, newer, other]), [newer, other]);
});

test("listing id makes equal timestamps deterministic", () => {
  const synchronizedAt = new Date("2026-01-01");
  const selected = selectRepresentativeListings([
    { id: "b", vehicleId: "car-1", synchronizedAt },
    { id: "a", vehicleId: "car-1", synchronizedAt },
  ]);
  assert.equal(selected[0].id, "a");
});

// The results grid's isVehicleRepresentative flag (maintained in SQL by
// refreshVehicleRepresentatives) must pick the same listing this policy does,
// so a car shown once in search and its market cohort agree on which ad.
test("newest sync wins across sources, smallest id breaks a tie", () => {
  const tie = new Date("2026-02-01");
  const chosen = selectRepresentativeListings([
    { id: "blocket-9", vehicleId: "car-1", synchronizedAt: tie },
    { id: "bytbil-2", vehicleId: "car-1", synchronizedAt: tie },
    { id: "wayke-1", vehicleId: "car-1", synchronizedAt: new Date("2026-02-03") },
  ]);
  assert.deepEqual(chosen.map((listing) => listing.id), ["wayke-1"]);

  // Tie-break is the lexicographically smallest listing id, whichever source.
  const tied = selectRepresentativeListings([
    { id: "wayke-2", vehicleId: "car-2", synchronizedAt: tie },
    { id: "blocket-9", vehicleId: "car-2", synchronizedAt: tie },
  ]);
  assert.equal(tied[0].id, "blocket-9");
});
