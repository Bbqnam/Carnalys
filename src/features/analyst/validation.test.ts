import assert from "node:assert/strict";
import test from "node:test";
import { defaultSearchFilters } from "@/features/search/search-state";
import { AnalystValidationError, parseAnalystRequest, validateToolArguments } from "./validation";

test("tool arguments accept only the four controlled read-only shapes", () => {
  assert.deepEqual(validateToolArguments("get_listing_analysis", { listingId: "listing_123", includeDescription: false }), {
    name: "get_listing_analysis",
    arguments: { listingId: "listing_123", includeDescription: false },
  });
  assert.throws(
    () => validateToolArguments("get_listing_analysis", { listingId: "listing_123", sql: "DROP TABLE" }),
    AnalystValidationError,
  );
  assert.throws(() => validateToolArguments("raw_sql", {}), AnalystValidationError);
});

test("comparison arguments require two or three safe listing ids", () => {
  assert.equal(validateToolArguments("compare_listings", { listingIds: ["a", "b", "c"] }).name, "compare_listings");
  assert.throws(() => validateToolArguments("compare_listings", { listingIds: ["a"] }), AnalystValidationError);
  assert.throws(() => validateToolArguments("compare_listings", { listingIds: ["a", "b", "c", "d"] }), AnalystValidationError);
  assert.throws(() => validateToolArguments("compare_listings", { listingIds: ["../secret", "b"] }), AnalystValidationError);
});

test("request validation caps session conversation and keeps trusted search filters typed", () => {
  const parsed = parseAnalystRequest({
    message: "Which is best value?",
    locale: "en",
    context: { surface: "search", filters: defaultSearchFilters },
    conversation: [{ role: "user", content: "Automatic only" }],
  });
  assert.equal(parsed.context.surface, "search");
  assert.equal(parsed.conversation.length, 1);
  assert.throws(() => parseAnalystRequest({
    message: "test",
    locale: "en",
    context: { surface: "listing", listingId: "a" },
    conversation: Array.from({ length: 5 }, () => ({ role: "user", content: "x" })),
  }), AnalystValidationError);
});

