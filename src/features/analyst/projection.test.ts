import assert from "node:assert/strict";
import test from "node:test";
import { analystListingSelect, forbiddenAnalystProjectionFields } from "./projection";

test("listing projection never selects private or raw source fields", () => {
  const keys = new Set<string>();
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collect(nested);
    }
  }
  collect(analystListingSelect);
  for (const forbidden of forbiddenAnalystProjectionFields) {
    assert.equal(keys.has(forbidden), false, `${forbidden} must not enter the Analyst projection`);
  }
  assert.equal(analystListingSelect.equipment.take, 20);
});

