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

test("selects the smallest useful Hedin Polaris image variant", () => {
  const enlarged =
    "https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/example-enlarged.jpg";
  assert.equal(
    imageLoader({ src: enlarged, width: 256 }),
    "https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/example-thumbnail.jpg?width=256",
  );
  assert.equal(
    imageLoader({ src: enlarged, width: 640 }),
    "https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/example-preview.jpg?width=640",
  );
  assert.equal(
    imageLoader({ src: enlarged, width: 1080 }),
    "https://cdne-cdn-prod-polaris-prod.azureedge.net/vehicles/example-enlarged.jpg?width=1080",
  );
});

test("adds responsive width parameters to imgix and static assets", () => {
  assert.equal(
    imageLoader({ src: "https://vl.imgix.net/img/volvo-logo.png", width: 64 }),
    "https://vl.imgix.net/img/volvo-logo.png?auto=format&fit=max&w=64",
  );
  assert.equal(imageLoader({ src: "/logo.svg", width: 48 }), "/logo.svg?width=48");
});
