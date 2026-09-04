import type { AnalystSurface } from "./types";

export function selectAnalystModel(message: string) {
  void message;
  return process.env.CARNALYS_ANALYST_MODEL ?? "gpt-5.6-luna";
}

// A comparison surface is inherently a weigh-the-tradeoffs question. Elsewhere,
// a handful of phrasings signal the same thing: "which is best", "compare",
// "recommend", "top 10" — the questions where a rushed low-effort pass reads
// as shallow, as opposed to "what's the mileage on this one".
const complexQuestionPatterns = [
  /\bbest\b|\bbäst\b/i,
  /\bcompar(e|ing|ison)\b|\bjämför/i,
  /\brecommend|rekommend/i,
  /\btop\s?\d|\btopp\s?\d/i,
  /\bwhich\b|\bvilken\b|\bvilka\b/i,
  /\bbetter\b|\bbättre\b/i,
  /\bshould i\b|\bbör jag\b/i,
  /\bworth it\b|\bvärt\b/i,
];

export function isComplexAnalystQuestion(message: string, surface: AnalystSurface) {
  return surface === "comparison" || complexQuestionPatterns.some((pattern) => pattern.test(message));
}

/**
 * Low effort keeps simple lookups ("what's the mileage") fast. A question that
 * asks the model to weigh options and reach a verdict gets more room to think,
 * since that's exactly where a rushed low-effort pass reads as shallow.
 */
export function selectAnalystReasoningEffort(message: string, surface: AnalystSurface): string {
  const base = process.env.CARNALYS_ANALYST_REASONING_EFFORT ?? "low";
  const complex = process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX ?? "medium";
  return isComplexAnalystQuestion(message, surface) ? complex : base;
}
