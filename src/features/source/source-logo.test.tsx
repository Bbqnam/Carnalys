import assert from "node:assert/strict";
import test from "node:test";
import { listingSource } from "@/infrastructure/marketplaces/source-registry";
import { sourceListingLabel } from "./source-label";

// SourceLogo itself pulls in bundled .svg artwork, which the test runner can't
// load; its behaviour is covered here through the pure pieces it composes —
// the accessible label and the per-source logo key.

test("every shipped source resolves to a provenance label, no seller wording", () => {
  for (const provider of ["blocket_unofficial", "wayke", "bytbil", "hedin"]) {
    const source = listingSource(provider);
    assert.equal(sourceListingLabel(source.displayName, "sv"), `Annons från ${source.displayName}`);
    assert.equal(sourceListingLabel(source.displayName, "en"), `Listing from ${source.displayName}`);
    assert.doesNotMatch(sourceListingLabel(source.displayName, "sv"), /Säljare|Seller|Via|From:/);
  }
});

test("shipped sources carry a logo key; unknown providers degrade to their name", () => {
  assert.equal(listingSource("blocket_unofficial").logoKey, "blocket");
  assert.equal(listingSource("wayke").logoKey, "wayke");
  assert.equal(listingSource("bytbil").logoKey, "bytbil");
  assert.equal(listingSource("hedin").logoKey, "hedin");

  const unknown = listingSource("some_future_dealer");
  assert.equal(unknown.displayName, "some_future_dealer");
  assert.equal(unknown.logoKey, undefined);
});
