import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceLogo } from "./source-logo";

test("renders one recognizable Blocket mark with an accessible source label", () => {
  const html = renderToStaticMarkup(<SourceLogo provider="blocket_unofficial" />);
  assert.match(html, /aria-label="Annons från Blocket"/);
  assert.equal((html.match(/>blocket</g) ?? []).length, 1);
});

test("renders Wayke provenance without seller text", () => {
  const html = renderToStaticMarkup(<SourceLogo provider="wayke" />);
  assert.match(html, />wayke</);
  assert.doesNotMatch(html, /Säljare|Seller/);
});

test("renders card provenance as a quiet image-edge mark", () => {
  const html = renderToStaticMarkup(<SourceLogo edgeAnchored provider="wayke" />);
  assert.match(html, /rounded-tr-md/);
  assert.doesNotMatch(html, /shadow-\[0_1px_3px/);
});
