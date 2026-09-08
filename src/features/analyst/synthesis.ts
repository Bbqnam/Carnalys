import { createHash } from "node:crypto";
import type { SearchFilters } from "@/features/search/types";
import type { AnalystBudget } from "./budget";
import { EvidenceRegistry, sanitizeEvidenceCitations } from "./evidence";
import { selectAnalystReasoningEffort, selectAnalystVerbosity } from "./models";
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
  /** Filters the last search_inventory call ran with, for the next turn to inherit. */
  appliedSearchFilters?: SearchFilters;
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
    ? `Det här är vad jag hunnit få fram så här långt${ids ? ` ${ids}` : ""}. Be mig fokusera på en av dem så gräver jag djupare.`
    : `Here's what I've pulled together so far${ids ? ` ${ids}` : ""}. Point me at one of these and I'll go deeper.`;
}

const SYNTHESIS_PROMPT = "That is enough research now — do not request any more tools. Reply in the same language the user used in their question. Answer directly and warmly using only what you already gathered. Give a clear recommendation, name the cars best-first, and cite the evidence id (e.g. [E3]) right after each car so the reader gets a link. Keep the shortlist genuinely comparable and, if the user gave a rough budget, keep your picks near it. Keep it short, and raise a caveat only if it genuinely changes the decision.";

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
  verbosity?: string;
}

// The evidence-gathering loop ran out of budget before the model produced a
// conclusion. Rather than return a canned dead-end, make one last tool-free
// call so the model has to answer from what it already collected.
export async function synthesizeAnswer({ provider, model, input, registry, request, budget, usage, userId, signal, stream, verbosity }: SynthesizeInputs): Promise<AnalystRunResult> {
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
    reasoningEffort: selectAnalystReasoningEffort(request.message, request.context.surface, request.conversation),
    verbosity: verbosity ?? selectAnalystVerbosity(request.message, request.context.surface, request.conversation),
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
