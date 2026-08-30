import assert from "node:assert/strict";
import test from "node:test";
import {
  assessAskingPrice,
  hasSuspiciousPriceWording,
} from "./price-plausibility";

const YEAR = 2026;
const base = { modelYear: 2022, currentYear: YEAR, marketValue: 300_000, comparableCount: 30 };

test("a fairly priced car is usable and not cautious", () => {
  const r = assessAskingPrice({ ...base, askingPrice: 285_000 });
  assert.deepEqual(r, { usable: true, cautious: false, reason: null, reasonCode: 0 });
});

test("1 kr placeholder -> below absolute minimum", () => {
  const r = assessAskingPrice({ ...base, askingPrice: 1 });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "below_absolute_minimum");
});

test("age-decayed floor still lets a genuine old banger through", () => {
  const r = assessAskingPrice({
    askingPrice: 6_000, modelYear: 2003, currentYear: YEAR, marketValue: 18_000, comparableCount: 20,
  });
  // 6000 / 18000 = 0.33 < 0.35 -> far_below_market, but NOT below_absolute_minimum
  assert.equal(r.reason, "far_below_market");
  const ok = assessAskingPrice({
    askingPrice: 9_000, modelYear: 2003, currentYear: YEAR, marketValue: 18_000, comparableCount: 20,
  });
  assert.equal(ok.usable, true);
});

test("huge typo price -> above absolute maximum or far above market", () => {
  assert.equal(assessAskingPrice({ ...base, askingPrice: 9_000_000 }).reason, "above_absolute_maximum");
  assert.equal(
    assessAskingPrice({ ...base, askingPrice: 329_900, marketValue: 41_000 }).reason,
    "far_above_market",
  );
});

test("leasing monthly price via structured monthlyCost -> quarantined", () => {
  const r = assessAskingPrice({
    ...base, askingPrice: 3_495, marketValue: 380_000, monthlyCost: 3_495,
  });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "below_absolute_minimum"); // 3495 < age floor for a 2022 car
});

test("monthly figure that clears the age floor is still caught by the 12x rule", () => {
  const r = assessAskingPrice({
    askingPrice: 34_900, modelYear: 2015, currentYear: YEAR,
    marketValue: 120_000, monthlyCost: 3_900, comparableCount: 25,
  });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "monthly_payment_figure");
});

test("below 35% of market is automatic quarantine", () => {
  const r = assessAskingPrice({ ...base, askingPrice: 300_000 * 0.3 });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "far_below_market");
});

test("verification zone (35-60%): leasing wording -> quarantined", () => {
  const r = assessAskingPrice({
    ...base, askingPrice: 300_000 * 0.5,
    text: "Privatleasing från 2 995 kr/mån. Ingen kontantinsats.",
  });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "leasing_or_deposit_wording");
});

test("verification zone: thin cohort -> quarantined as unverified", () => {
  const r = assessAskingPrice({
    ...base, askingPrice: 300_000 * 0.5, comparableCount: 5, text: "Välvårdad, ny kamrem.",
  });
  assert.equal(r.usable, false);
  assert.equal(r.reason, "unverified_low_price");
});

test("verification zone: dense cohort, clean text -> allowed but cautious", () => {
  const r = assessAskingPrice({
    ...base, askingPrice: 300_000 * 0.5, comparableCount: 30,
    text: "Motorlampa lyser, säljes i befintligt skick, snabb affär önskas.",
  });
  assert.deepEqual(r, { usable: true, cautious: true, reason: null, reasonCode: 0 });
});

test("no market value -> only absolute and structural checks apply", () => {
  assert.equal(assessAskingPrice({ ...base, askingPrice: 120_000, marketValue: null }).usable, true);
  assert.equal(
    assessAskingPrice({ ...base, askingPrice: 120_000, marketValue: null, monthlyCost: 12_000 }).reason,
    "monthly_payment_figure",
  );
});

test("wording detector: hits leasing/deposit/monthly phrasings, ignores ordinary text", () => {
  for (const s of [
    "Privatleasing 3495 kr/mån",
    "Företagsleasing tillgänglig",
    "Endast avbetalning",
    "Kontantinsats 49 500 kr",
    "Pris från 199 000 kr vid inbyte",
    "1 995 kr/mån",
    "Månadskostnad ca 4 000",
  ]) {
    assert.ok(hasSuspiciousPriceWording(s), `should flag: ${s}`);
  }
  for (const s of [
    "Nyservad, kamrem bytt, två nycklar.",
    "Dragkrok, vinterhjul ingår.",
    "En ägare från ny, fullständig servicebok.",
    "",
    null,
  ]) {
    assert.ok(!hasSuspiciousPriceWording(s), `should not flag: ${s}`);
  }
});
