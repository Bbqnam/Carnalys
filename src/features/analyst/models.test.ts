import assert from "node:assert/strict";
import test from "node:test";
import {
  isComplexAnalystQuestion,
  selectAnalystModel,
  selectAnalystReasoningEffort,
  selectAnalystTurnBudget,
  selectAnalystVerbosity,
} from "./models";

test("GPT-5.6 Luna is the cost-optimized default analyst model", () => {
  const before = process.env.CARNALYS_ANALYST_MODEL;
  delete process.env.CARNALYS_ANALYST_MODEL;
  try {
    assert.equal(selectAnalystModel("Show its price history."), "gpt-5.6-luna");
  } finally {
    if (before === undefined) delete process.env.CARNALYS_ANALYST_MODEL;
    else process.env.CARNALYS_ANALYST_MODEL = before;
  }
});

test("a comparison surface or a which-is-best phrasing counts as complex, a plain lookup does not", () => {
  assert.equal(isComplexAnalystQuestion("What's the mileage?", "comparison"), true);
  assert.equal(isComplexAnalystQuestion("Which of these is the best buy?", "search"), true);
  assert.equal(isComplexAnalystQuestion("Vilken bil är bäst för mig?", "listing"), true);
  assert.equal(isComplexAnalystQuestion("Show its price history.", "listing"), false);
  assert.equal(isComplexAnalystQuestion("Vad är miltalet?", "search"), false);
});

test("a budget or value phrasing counts as complex, but a bare model year does not", () => {
  assert.equal(isComplexAnalystQuestion("around 200 000 kr", "search"), true);
  assert.equal(isComplexAnalystQuestion("something under 180000", "search"), true);
  assert.equal(isComplexAnalystQuestion("best value right now", "search"), true);
  assert.equal(isComplexAnalystQuestion("show cheaper alternatives", "listing"), true);
  assert.equal(isComplexAnalystQuestion("is the 2019 model any good", "listing"), false);
});

test("a terse follow-up inherits the effort of an earlier complex turn in the thread", () => {
  const thread = [
    { role: "user" as const, content: "around 200 000 kr" },
    { role: "assistant" as const, content: "Here are a few options." },
  ];
  assert.equal(isComplexAnalystQuestion("not a transport car", "search"), false);
  assert.equal(isComplexAnalystQuestion("not a transport car", "search", thread), true);
  assert.equal(selectAnalystReasoningEffort("under 15000 mil", "search", thread), "medium");
});

test("verbosity and turn budget widen for a weigh-the-options question", () => {
  assert.equal(selectAnalystVerbosity("what's the mileage", "listing"), "low");
  assert.equal(selectAnalystVerbosity("which is the best buy", "search"), "medium");
  assert.deepEqual(selectAnalystTurnBudget("what's the mileage", "listing"), { maxTurns: 3, maxToolCalls: 5 });
  assert.deepEqual(selectAnalystTurnBudget("which is the best buy", "comparison"), { maxTurns: 4, maxToolCalls: 6 });
});

test("reasoning effort steps up for a complex question and falls back to the env default otherwise", () => {
  const before = { base: process.env.CARNALYS_ANALYST_REASONING_EFFORT, complex: process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX };
  delete process.env.CARNALYS_ANALYST_REASONING_EFFORT;
  delete process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX;
  try {
    assert.equal(selectAnalystReasoningEffort("What's the mileage?", "listing"), "low");
    assert.equal(selectAnalystReasoningEffort("Which is the best buy?", "search"), "medium");
    assert.equal(selectAnalystReasoningEffort("Anything at all", "comparison"), "medium");
  } finally {
    if (before.base === undefined) delete process.env.CARNALYS_ANALYST_REASONING_EFFORT;
    else process.env.CARNALYS_ANALYST_REASONING_EFFORT = before.base;
    if (before.complex === undefined) delete process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX;
    else process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX = before.complex;
  }
});
