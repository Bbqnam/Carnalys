import assert from "node:assert/strict";
import test from "node:test";
import { analystEvaluationFixtures, type EvalRun } from "./evals";

test("lean V1 evaluation set covers every everyday capability and safety edge", () => {
  assert.equal(analystEvaluationFixtures.length >= 10, true);
  const ids = new Set(analystEvaluationFixtures.map(({ id }) => id));
  for (const required of [
    "listing-analysis", "deal-score", "fair-price", "alternatives", "price-history",
    "inventory-search", "comparison-cost", "injection", "disappearance",
    "budget-around-target", "budget-hard-ceiling", "retain-budget-followup",
  ]) {
    assert.equal(ids.has(required), true, `missing evaluation ${required}`);
  }
  for (const fixture of analystEvaluationFixtures) {
    assert.equal(fixture.expectedTools.length > 0, true);
    assert.equal(fixture.requiredBehaviors.length > 0, true);
  }
});

test("the around-200k check fails a bare ceiling and passes a real target", () => {
  const fixture = analystEvaluationFixtures.find(({ id }) => id === "budget-around-target");
  assert.ok(fixture?.check);
  const bareCeiling: EvalRun = {
    answer: "Here are the cheapest cars under 200 000.",
    toolCalls: [{ name: "search_inventory", arguments: { filters: { maxPrice: 200_000 }, targetPrice: null } }],
  };
  const realTarget: EvalRun = {
    answer: "Around 200k, aiming near your budget, here are three estates.",
    toolCalls: [{ name: "search_inventory", arguments: { filters: { minPrice: null, maxPrice: null }, targetPrice: 200_000 } }],
  };
  assert.equal(fixture!.check!(bareCeiling).length > 0, true);
  assert.equal(fixture!.check!(realTarget).length, 0);
});

// The full model-in-the-loop run is opt-in: it calls the real API and the
// target database. Enable with CARNALYS_ANALYST_EVAL_LIVE=1 (plus OPENAI_API_KEY
// and, for the listing/comparison fixtures, CARNALYS_ANALYST_EVAL_LISTING_ID /
// CARNALYS_ANALYST_EVAL_COMPARISON_IDS).
const liveEnabled = process.env.CARNALYS_ANALYST_EVAL_LIVE === "1" && Boolean(process.env.OPENAI_API_KEY);

test("live analyst evaluations pass their hard checks", { skip: liveEnabled ? false : "set CARNALYS_ANALYST_EVAL_LIVE=1 and OPENAI_API_KEY" }, async () => {
  const { runAnalystEvaluations } = await import("./evals-runner");
  const report = await runAnalystEvaluations();
  const failed = report.results.filter((result) => !result.passed);
  const detail = failed.map((result) => `\n- ${result.id}: ${result.failures.join("; ")}`).join("");
  assert.equal(failed.length, 0, `${failed.length}/${report.total} evaluations failed:${detail}`);
});

