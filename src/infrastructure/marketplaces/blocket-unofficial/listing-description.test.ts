import assert from "node:assert/strict";
import test from "node:test";
import { getBlocketListingDescription } from "./listing-description";

test("recovers missing descriptions from the canonical page with caching", async () => {
  const stub = (async (url, options) => {
    assert.equal(url, "https://www.blocket.se/mobility/item/123");
    assert.equal((options as RequestInit & { next: { revalidate: number } }).next.revalidate, 86400);
    return new Response('<section><h2>Beskrivning</h2><div class="import-decoration">Original text<br>Service utförd</div></section>');
  }) as typeof fetch;
  assert.equal(await getBlocketListingDescription("123", stub), "Original text\nService utförd");
});

test("missing or unavailable source pages do not break the vehicle page", async () => {
  const unavailable = (async () => new Response("Missing", { status: 404 })) as typeof fetch;
  const timeout = (async () => { throw new Error("timeout"); }) as typeof fetch;
  assert.equal(await getBlocketListingDescription("123", unavailable), undefined);
  assert.equal(await getBlocketListingDescription("123", timeout), undefined);
  assert.equal(await getBlocketListingDescription("../../other", timeout), undefined);
});
