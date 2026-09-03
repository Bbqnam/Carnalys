import assert from "node:assert/strict";
import test from "node:test";
import { analystEvaluationFixtures } from "./evals";

test("lean V1 evaluation set covers every everyday capability and safety edge", () => {
  assert.equal(analystEvaluationFixtures.length >= 10, true);
  const ids = new Set(analystEvaluationFixtures.map(({ id }) => id));
  for (const required of ["listing-analysis", "deal-score", "fair-price", "alternatives", "price-history", "inventory-search", "comparison-cost", "injection", "disappearance"]) {
    assert.equal(ids.has(required), true, `missing evaluation ${required}`);
  }
  for (const fixture of analystEvaluationFixtures) {
    assert.equal(fixture.expectedTools.length > 0, true);
    assert.equal(fixture.requiredBehaviors.length > 0, true);
    assert.equal(fixture.forbiddenClaims.length > 0, true);
  }
});

