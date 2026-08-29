import assert from "node:assert/strict";
import test from "node:test";
import imageLoader from "./blocket-image-loader";

const cfitImage =
  "https://cdn.wayke.se/cfit/v3/171376cdda24418c9c5d46c748d7ee2b/7d7f9041586741bab7af90e09d586b28";

test("maps Next image widths to supported Wayke cfit variants", () => {
  assert.equal(
    imageLoader({ src: cfitImage, width: 640 }),
    `${cfitImage}?format=webp&w=770`,
  );
  assert.equal(
    imageLoader({ src: cfitImage, width: 828 }),
    `${cfitImage}?format=webp&w=1170`,
  );
});

test("keeps arbitrary resizing for Wayke media images", () => {
  const mediaImage =
    "https://cdn.wayke.se/media/e7116d9927c54dd299e24db3f3b6479c/292526519bcb4172b4874849b589777f";
  assert.equal(
    imageLoader({ src: mediaImage, width: 640 }),
    `${mediaImage}?w=640`,
  );
});
