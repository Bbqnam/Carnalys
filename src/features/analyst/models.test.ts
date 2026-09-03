import assert from "node:assert/strict";
import test from "node:test";
import { selectAnalystModel } from "./models";

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
