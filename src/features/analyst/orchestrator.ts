import { EvidenceRegistry } from "./evidence";
import { selectAnalystModel } from "./models";
import { analystInstructions, initialModelInput } from "./prompt";
import type { AnalystModelProvider, ModelUsage } from "./provider";
import { OpenAIResponsesProvider } from "./provider";
import {
  addUsage,
  finalizeTextAnswer,
  safeIdentifier,
  synthesizeAnswer,
  type AnalystRunResult,
} from "./synthesis";
import { analystToolDefinitions } from "./tool-definitions";
import { AnalystToolSession } from "./tool-executor";
import type { AnalystRequest } from "./types";
import { AnalystBudget } from "./budget";

export const MAX_MODEL_TURNS = 3;
export const MAX_TOOL_CALLS = 4;

export type { AnalystRunResult };

export interface AnalystRunOptions {
  request: AnalystRequest;
  userId: string;
  signal: AbortSignal;
  provider?: AnalystModelProvider;
  onStatus?: (message: string) => void;
  /**
   * Forwards the model's visible answer as it streams. `isFirst` is true for
   * the first chunk of a given model turn, so a consumer can replace the text
   * so far rather than append it — an evidence-gathering turn produces little
   * or no prose and is harmlessly superseded by the turn that answers.
   */
  onAnswerDelta?: (delta: string, isFirst: boolean) => void;
}

function parseArguments(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function runAnalyst(options: AnalystRunOptions): Promise<AnalystRunResult> {
  const provider = options.provider ?? new OpenAIResponsesProvider();
  const model = selectAnalystModel(options.request.message);
  const input: unknown[] = [...initialModelInput(options.request)];
  const registry = new EvidenceRegistry();
  const tools = new AnalystToolSession({ context: options.request.context, signal: options.signal });
  const usage: ModelUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const budget = new AnalystBudget(MAX_MODEL_TURNS, MAX_TOOL_CALLS);

  const stream = options.onAnswerDelta
    ? { onTextDelta: options.onAnswerDelta }
    : undefined;

  const synthesize = () => synthesizeAnswer({
    provider,
    model,
    input,
    registry,
    request: options.request,
    budget,
    usage,
    userId: options.userId,
    signal: options.signal,
    stream,
  });

  for (let turn = 0; turn < MAX_MODEL_TURNS; turn += 1) {
    if (!budget.startTurn()) break;
    options.signal.throwIfAborted();
    options.onStatus?.(turn === 0
      ? (options.request.locale === "sv" ? "Förbereder analys…" : "Preparing analysis…")
      : (options.request.locale === "sv" ? "Tolkar underlaget…" : "Interpreting evidence…"));
    const response = await provider.createResponse({
      model,
      instructions: analystInstructions,
      input,
      tools: analystToolDefinitions,
      safetyIdentifier: safeIdentifier(options.userId),
    }, options.signal, stream);
    addUsage(usage, response.usage);

    if (response.toolCalls.length === 0) {
      if (!response.outputText.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
      return finalizeTextAnswer({ text: response.outputText, registry, request: options.request, model, budget, usage, truncated: false });
    }

    if (!budget.reserveToolCalls(response.toolCalls.length) || turn === MAX_MODEL_TURNS - 1) {
      return synthesize();
    }

    input.push(...response.output);
    for (const call of response.toolCalls) {
      options.signal.throwIfAborted();
      options.onStatus?.(options.request.locale === "sv" ? "Hämtar Carnalys-underlag…" : "Reading Carnalys evidence…");
      let output: unknown;
      try {
        output = registry.register(await tools.execute(call.name, parseArguments(call.argumentsJson)));
      } catch (error) {
        output = {
          error: error instanceof Error && error.message === "LISTING_NOT_FOUND"
            ? "The listing is unavailable."
            : "The read-only tool could not complete this request.",
        };
      }
      input.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(output) });
    }
  }

  return synthesize();
}
