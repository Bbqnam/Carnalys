import assert from "node:assert/strict";
import test from "node:test";
import { parseListingPageImageUrls } from "./listing-page-parser";

test("extracts and de-duplicates only the requested Blocket listing gallery", () => {
  const html = `
    <meta property="og:image" content="https://images.blocketcdn.se/dynamic/default/item/123/first?width=1200&amp;quality=80">
    <img src="https://images.blocketcdn.se/dynamic/default/item/123/first?width=640">
    <img src="https://images.blocketcdn.se/dynamic/default/item/123/second">
    <img src="https://images.blocketcdn.se/dynamic/default/item/999/recommendation">
  `;

  assert.deepEqual(parseListingPageImageUrls(html, "123"), [
    "https://images.blocketcdn.se/dynamic/default/item/123/first",
    "https://images.blocketcdn.se/dynamic/default/item/123/second",
  ]);
});

test("returns an empty gallery when the page has no matching listing images", () => {
  assert.deepEqual(
    parseListingPageImageUrls(
      '<img src="https://images.blocketcdn.se/dynamic/default/item/999/photo">',
      "123",
    ),
    [],
  );
});
