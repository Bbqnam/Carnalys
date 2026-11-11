import assert from "node:assert/strict";
import test from "node:test";
import { parseListingPageDescription, parseListingPageImageUrls } from "./listing-page-parser";

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


test("extracts complete seller text with paragraphs, nested markup and entities", () => {
  const html = `<section><h2 class="t3">Beskrivning</h2>
    <div data-testid="expandable-section"><div class="whitespace-pre-wrap import-decoration">Välskött &amp; fin<br><br><p>Service <strong>utförd</strong>.</p><div>Ring oss!</div></div></div>
    <button>Visa mer</button></section><section>Other advert content</section>`;
  assert.equal(parseListingPageDescription(html), "Välskött & fin\n\nService utförd.\nRing oss!");
});

test("does not invent a description from metadata or surrounding page text", () => {
  assert.equal(parseListingPageDescription('<meta name="description" content="Find cars">'), undefined);
  assert.equal(parseListingPageDescription('<section><h2>Beskrivning</h2><div class="import-decoration"> </div></section>'), undefined);
});

test("deduplicates Blocket responsive renditions into one photo per gallery item", () => {
  const cdn = "https://images.blocketcdn.se/dynamic";
  const html = `
    <img srcset="${cdn}/320w/item/123/front 320w, ${cdn}/640w/item/123/front 640w">
    <img src="${cdn}/default/item/123/front?width=1280">
    <img src="${cdn}/960w/item/123/side">
    <img src="${cdn}/960w/item/1234/another-car">
    <img src="${cdn}/320w/item/123/side/extra">
  `;
  assert.deepEqual(parseListingPageImageUrls(html, "123"), [
    `${cdn}/default/item/123/front`,
    `${cdn}/default/item/123/side`,
  ]);
});
