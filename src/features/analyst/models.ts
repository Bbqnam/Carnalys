import type { AnalystConversationMessage, AnalystSurface } from "./types";

export function selectAnalystModel(message: string) {
  void message;
  return process.env.CARNALYS_ANALYST_MODEL ?? "gpt-5.6-luna";
}

// A comparison surface is inherently a weigh-the-tradeoffs question. Elsewhere,
// a handful of phrasings signal the same thing: "which is best", "compare",
// "recommend", "top 10" — plus anything that reads as a budget or a
// value/shortlist question ("around 200k", "under 180 000", "best value",
// "alternatives"), since those are exactly where a rushed low-effort pass reads
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
  /\baround\b|\babout\b|\broughly\b|\bunder\b|\bbudget\b|\bspend\b/i,
  /\bvalue\b|\bvärde\b|\bcheap|\bbillig|\baffordable\b|\balternativ|\balternative/i,
  // A price-shaped number ("200 000", "200000", "200k", "… kr"), not a bare
  // four-digit model year.
  /\d[\s.]\d{3}\b|\d{5,}|\d+\s?k\b|\bkr\b|\bsek\b/i,
];

function matchesComplexPattern(message: string) {
  return complexQuestionPatterns.some((pattern) => pattern.test(message));
}

/**
 * A follow-up like "not a transport car" or "under 15000 mil" carries no
 * trigger word on its own, but it is a turn inside an ongoing recommendation
 * thread and deserves the same effort as the question that started it — so an
 * earlier user turn matching a complex pattern keeps the whole thread elevated.
 */
export function isComplexAnalystQuestion(
  message: string,
  surface: AnalystSurface,
  conversation: readonly AnalystConversationMessage[] = [],
) {
  if (surface === "comparison" || matchesComplexPattern(message)) return true;
  return conversation.some(
    (entry) => entry.role === "user" && matchesComplexPattern(entry.content),
  );
}

/**
 * Low effort keeps simple lookups ("what's the mileage") fast. A question that
 * asks the model to weigh options and reach a verdict gets more room to think,
 * since that's exactly where a rushed low-effort pass reads as shallow.
 */
export function selectAnalystReasoningEffort(
  message: string,
  surface: AnalystSurface,
  conversation: readonly AnalystConversationMessage[] = [],
): string {
  const base = process.env.CARNALYS_ANALYST_REASONING_EFFORT ?? "low";
  const complex = process.env.CARNALYS_ANALYST_REASONING_EFFORT_COMPLEX ?? "medium";
  return isComplexAnalystQuestion(message, surface, conversation) ? complex : base;
}

/** A recommendation or comparison reads better with a little more room to breathe. */
export function selectAnalystVerbosity(
  message: string,
  surface: AnalystSurface,
  conversation: readonly AnalystConversationMessage[] = [],
): string {
  return isComplexAnalystQuestion(message, surface, conversation) ? "medium" : "low";
}

/**
 * A weigh-the-options question naturally wants search → deep-dive a couple of
 * finalists → an independent market check → synthesis, which is cramped in
 * three turns. A plain lookup keeps the tighter budget.
 */
export function selectAnalystTurnBudget(
  message: string,
  surface: AnalystSurface,
  conversation: readonly AnalystConversationMessage[] = [],
): { maxTurns: number; maxToolCalls: number } {
  return isComplexAnalystQuestion(message, surface, conversation)
    ? { maxTurns: 4, maxToolCalls: 6 }
    : { maxTurns: 3, maxToolCalls: 5 };
}
