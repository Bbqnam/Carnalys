import assert from "node:assert/strict";
import test from "node:test";
import { boundedEditDistance, brandOptionMatchesQuery, resolveBrandAlias } from "./brand-search";

test("boundedEditDistance counts a transposition as one edit and caps out", () => {
  assert.equal(boundedEditDistance("vw", "vw", 2), 0);
  assert.equal(boundedEditDistance("wv", "vw", 2), 1);
  assert.equal(boundedEditDistance("mercedez", "mercedes", 2), 1);
  assert.equal(boundedEditDistance("abcdef", "uvwxyz", 2), 3);
});

test("resolveBrandAlias maps exact aliases to the canonical brand", () => {
  assert.equal(resolveBrandAlias("vw"), "Volkswagen");
  assert.equal(resolveBrandAlias("VW"), "Volkswagen");
  assert.equal(resolveBrandAlias("  Volkswagen "), "Volkswagen");
  assert.equal(resolveBrandAlias("merc"), "Mercedes-Benz");
  assert.equal(resolveBrandAlias("mercedes"), "Mercedes-Benz");
  assert.equal(resolveBrandAlias("škoda"), "Skoda");
});

test("resolveBrandAlias recovers from common typos", () => {
  assert.equal(resolveBrandAlias("wv"), "Volkswagen");
  assert.equal(resolveBrandAlias("volkswagon"), "Volkswagen");
  assert.equal(resolveBrandAlias("vollkswagen"), "Volkswagen");
  assert.equal(resolveBrandAlias("mercedez"), "Mercedes-Benz");
  assert.equal(resolveBrandAlias("toyata"), "Toyota");
  assert.equal(resolveBrandAlias("volvos"), "Volvo");
});

test("resolveBrandAlias refuses ambiguous or model-shaped input", () => {
  assert.equal(resolveBrandAlias("a4"), null);
  assert.equal(resolveBrandAlias("x"), null);
  assert.equal(resolveBrandAlias(""), null);
  assert.equal(resolveBrandAlias("zzzzzz"), null);
});

test("brandOptionMatchesQuery powers a fuzzy brand filter", () => {
  assert.equal(brandOptionMatchesQuery("Volkswagen", "vw"), true);
  assert.equal(brandOptionMatchesQuery("Volkswagen", "wv"), true);
  assert.equal(brandOptionMatchesQuery("Mercedes-Benz", "merc"), true);
  assert.equal(brandOptionMatchesQuery("Volvo", "vw"), false);
  assert.equal(brandOptionMatchesQuery("Volkswagen", ""), true);
});
