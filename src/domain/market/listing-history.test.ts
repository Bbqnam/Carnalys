import assert from "node:assert/strict";
import test from "node:test";
import { meaningfulListingEvents } from "./listing-history";

const previous = {
  status: "active",
  priceAmount: 199_900,
  mileageKm: 72_000,
  sellerName: "Bilhandlaren",
  sellerOrganizationNumber: "5560000000",
  sellerType: "dealer",
};

test("a first sighting creates exactly one lifecycle event", () => {
  assert.deepEqual(meaningfulListingEvents(undefined, previous), ["first_seen"]);
});

test("an unchanged sighting creates no historical event", () => {
  assert.deepEqual(meaningfulListingEvents(previous, previous), []);
});

test("simultaneous changes are all preserved", () => {
  assert.deepEqual(
    meaningfulListingEvents(previous, {
      ...previous,
      priceAmount: 189_900,
      mileageKm: 73_000,
      sellerName: "Ny bilhandlare",
    }),
    ["price_change", "mileage_change", "seller_change"],
  );
});

test("a returning ad records reactivation and changes discovered on return", () => {
  assert.deepEqual(
    meaningfulListingEvents(
      { ...previous, status: "removed" },
      { ...previous, priceAmount: 194_900 },
    ),
    ["relisted", "price_change"],
  );
});
