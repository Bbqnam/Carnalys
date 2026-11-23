import assert from "node:assert/strict";
import { test } from "node:test";

import { formatExactListingDate, formatListingPublication, formatRelativeListingDate, formatSynchronizedAt } from "./format";

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

test("listing publication uses the source date for its relative age", (context) => {
  context.mock.method(Date, "now", () => Date.parse("2026-09-02T14:20:00Z"));
  const publishedAt = "2026-09-02T12:15:00Z";
  assert.deepEqual(formatListingPublication(publishedAt, "blocket", "en"), {
    dateTime: publishedAt,
    age: "2h ago",
    estimatedRenewal: false,
  });
});

test("Bytbil renewal age is marked as an estimate", (context) => {
  context.mock.method(Date, "now", () => Date.parse("2026-09-02T12:27:30Z"));
  const publishedAt = "2026-09-02T12:15:00Z";
  assert.deepEqual(formatListingPublication(publishedAt, "bytbil", "sv"), {
    dateTime: publishedAt,
    age: "12m sedan",
    estimatedRenewal: true,
  });
});

test("listing publication is unavailable without a valid source date", () => {
  assert.equal(formatListingPublication(undefined, "hedin", "en"), undefined);
  assert.equal(formatListingPublication("invalid", "blocket", "en"), undefined);
});

test("relative ages use seconds, minutes, hours, days, and weeks", (context) => {
  const now = Date.parse("2026-09-02T12:00:00Z");
  context.mock.method(Date, "now", () => now);
  const cases = [
    [59, "59s ago"],
    [60, "1m ago"],
    [3_600, "1h ago"],
    [86_400, "1d ago"],
    [604_799, "6d ago"],
    [604_800, "1w ago"],
    [3_628_800, "6w ago"],
  ] as const;
  for (const [seconds, expected] of cases) {
    const publishedAt = new Date(now - seconds * 1_000).toISOString();
    assert.equal(formatRelativeListingDate(publishedAt, "en"), expected);
  }
  assert.equal(formatRelativeListingDate("2026-08-19T12:00:00Z", "sv"), "2v sedan");
});
