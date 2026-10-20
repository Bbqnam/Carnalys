import assert from "node:assert/strict";
import test from "node:test";
import { parseVehicleSearchOptions, vehicleSearchUrl } from "./search-state";

test("market discount is an accepted, shareable catalogue sort", () => {
  const parsed = parseVehicleSearchOptions({ sort: "market_discount" });

  assert.equal(parsed.sort, "market_discount");
  assert.equal(
    vehicleSearchUrl(parsed),
    "/?sort=market_discount#cars",
  );
});

test("unknown catalogue sorts still fall back safely", () => {
  assert.equal(parseVehicleSearchOptions({ sort: "not-a-sort" }).sort, "newest");
});
