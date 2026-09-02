import assert from "node:assert/strict";
import { test } from "node:test";

import { formatExactListingDate, formatSynchronizedAt } from "./format";

// These formatters must render byte-identically on the server (Node's bundled
// ICU) and in the browser, or React hydration fails. `Intl` with
// `month: "short"` does not — Node says "Sep", current Chrome says "Sept" — so
// the month name comes from our own table and only the numeric parts of `Intl`
// output (which are ICU-version stable) are used.

test("formatSynchronizedAt renders a controlled month abbreviation in Stockholm time", () => {
  // 12:15Z in September is 14:15 CEST (+2).
  assert.equal(formatSynchronizedAt("2026-09-02T12:15:00Z", "en"), "2 Sep 14:15");
  assert.equal(formatSynchronizedAt("2026-09-02T12:15:00Z", "sv"), "2 sep 14:15");
});

test("formatSynchronizedAt zero-pads the hour and rolls the date across the TZ offset", () => {
  // 23:05Z on the 5th is 00:05 CET (+1) on the 6th.
  assert.equal(formatSynchronizedAt("2026-01-05T23:05:00Z", "en"), "6 Jan 00:05");
});

test("formatExactListingDate keeps the year and the same controlled month table", () => {
  assert.equal(
    formatExactListingDate("2026-09-02T12:15:00Z", "en"),
    "2 Sep 2026 14:15",
  );
  assert.equal(
    formatExactListingDate("2026-09-02T12:15:00Z", "sv"),
    "2 sep 2026 14:15",
  );
});
