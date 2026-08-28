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
