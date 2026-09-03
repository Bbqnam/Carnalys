import { createHash } from "node:crypto";
import type { AnalystBudget } from "./budget";
import { EvidenceRegistry, sanitizeEvidenceCitations } from "./evidence";
import { analystInstructions } from "./prompt";
import type { AnalystModelProvider, ModelUsage, StreamCallbacks } from "./provider";
import type { AnalystEvidence, AnalystRequest } from "./types";

export interface AnalystRunResult {
  answer: string;
  evidence: readonly AnalystEvidence[];
  model: string;
  modelTurns: number;
  toolCalls: number;
  usage: ModelUsage;
  invalidEvidenceIds: readonly string[];
  truncated: boolean;
}

export function addUsage(total: ModelUsage, next: ModelUsage) {
  total.inputTokens += next.inputTokens;
  total.cachedInputTokens += next.cachedInputTokens;
  total.outputTokens += next.outputTokens;
  total.reasoningTokens += next.reasoningTokens;
}

export function safeIdentifier(userId: string) {
  return createHash("sha256").update(`carnalys-analyst:${userId}`).digest("base64url").slice(0, 32);
}

export function fallbackAnswer(locale: "en" | "sv", evidence: readonly AnalystEvidence[]) {
  const ids = evidence.slice(0, 4).map(({ id }) => `[${id}]`).join(" ");
  return locale === "sv"
    ? `Jag nådde analysgränsen innan en fullständig slutsats kunde formuleras. Det insamlade underlaget finns nedan${ids ? ` ${ids}` : ""}. Försök gärna med en smalare fråga.`
    : `I reached the analysis limit before a complete conclusion could be produced. The collected evidence is shown below${ids ? ` ${ids}` : ""}. Try a narrower question.`;
}

const SYNTHESIS_PROMPT = "That is enough research now — do not request any more tools. Reply in the same language the user used in their question. Answer directly and warmly using only what you already gathered. Give a clear recommendation and cite the evidence id (e.g. [E3]) right after each car you name so the reader gets a link. Keep it short, and raise a caveat only if it genuinely changes the decision.";

interface FinalizeInputs {
  text: string;
  registry: EvidenceRegistry;
  request: AnalystRequest;
  model: string;
  budget: AnalystBudget;
  usage: ModelUsage;
  truncated: boolean;
}

export function finalizeTextAnswer({ text, registry, request, model, budget, usage, truncated }: FinalizeInputs): AnalystRunResult {
  const evidence = registry.all();
  const validated = sanitizeEvidenceCitations(text, evidence);
  const cited = /\[E\d+\]/.test(validated.text);
  const answer = !cited && evidence.length
    ? `${validated.text}\n\n${request.locale === "sv" ? "Underlag" : "Evidence"}: ${evidence.slice(0, 4).map(({ id }) => `[${id}]`).join(" ")}`
    : validated.text;
  return {
    answer,
    evidence,
    model,
    modelTurns: budget.turns,
    toolCalls: budget.toolCalls,
    usage,
    invalidEvidenceIds: validated.invalid,
    truncated,
  };
}

interface SynthesizeInputs {
  provider: AnalystModelProvider;
  model: string;
  input: unknown[];
  registry: EvidenceRegistry;
  request: AnalystRequest;
  budget: AnalystBudget;
  usage: ModelUsage;
  userId: string;
  signal: AbortSignal;
  stream?: StreamCallbacks;
}

// The evidence-gathering loop ran out of budget before the model produced a
// conclusion. Rather than return a canned dead-end, make one last tool-free
// call so the model has to answer from what it already collected.
export async function synthesizeAnswer({ provider, model, input, registry, request, budget, usage, userId, signal, stream }: SynthesizeInputs): Promise<AnalystRunResult> {
  signal.throwIfAborted();
  input.push({
    role: "user" as const,
    content: [{ type: "input_text" as const, text: SYNTHESIS_PROMPT }],
  });
  const response = await provider.createResponse({
    model,
    instructions: analystInstructions,
    input,
    tools: [],
    safetyIdentifier: safeIdentifier(userId),
  }, signal, stream);
  addUsage(usage, response.usage);

  if (response.outputText.trim()) {
    return finalizeTextAnswer({ text: response.outputText, registry, request, model, budget, usage, truncated: true });
  }

  const evidence = registry.all();
  return {
    answer: fallbackAnswer(request.locale, evidence),
    evidence,
    model,
    modelTurns: budget.turns,
    toolCalls: budget.toolCalls,
    usage,
    invalidEvidenceIds: [],
    truncated: true,
  };
}
