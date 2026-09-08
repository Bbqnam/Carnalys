import "server-only";

import type { AnalystModelProvider, ModelRequest, ModelResponse, StreamCallbacks } from "./provider";
import { OpenAIResponsesProvider } from "./provider";
import { runAnalyst } from "./orchestrator";
import type { AnalystContext, AnalystRequest } from "./types";
import { analystEvaluationFixtures, type AnalystEvaluationFixture, type EvalRun, type EvalToolCall } from "./evals";

export interface EvaluationResult {
  id: string;
  passed: boolean;
  /** Hard failures: a wrong tool, a forbidden claim, or a failed deterministic check. */
  failures: readonly string[];
  /** Required behaviours whose keyword was not found — advisory, not a hard fail. */
  softMisses: readonly string[];
  toolsUsed: readonly string[];
  answer: string;
}

export interface EvaluationReport {
  total: number;
  passed: number;
  results: readonly EvaluationResult[];
}

/** Wraps a provider and records every tool call the model made, with parsed arguments. */
class RecordingProvider implements AnalystModelProvider {
  readonly toolCalls: EvalToolCall[] = [];
  constructor(private readonly inner: AnalystModelProvider) {}
  async createResponse(request: ModelRequest, signal: AbortSignal, stream?: StreamCallbacks): Promise<ModelResponse> {
    const response = await this.inner.createResponse(request, signal, stream);
    for (const call of response.toolCalls) {
      let parsed: Record<string, unknown> = {};
      try {
        const value = JSON.parse(call.argumentsJson) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
      } catch {
        // A malformed tool-call payload records as empty arguments.
      }
      this.toolCalls.push({ name: call.name as EvalToolCall["name"], arguments: parsed });
    }
    return response;
  }
}

export interface EvaluationOptions {
  provider?: AnalystModelProvider;
  userId?: string;
  /**
   * Supplies the page context for a fixture's surface. Listing and comparison
   * fixtures need real listing ids from the target database; return null to skip
   * them.
   */
  contextForSurface?: (surface: AnalystEvaluationFixture["surface"]) => AnalystContext | null;
}

function defaultContextForSurface(surface: AnalystEvaluationFixture["surface"]): AnalystContext | null {
  if (surface === "search") return { surface: "search", filters: defaultFiltersForEval() };
  if (surface === "listing") {
    const id = process.env.CARNALYS_ANALYST_EVAL_LISTING_ID;
    return id ? { surface: "listing", listingId: id } : null;
  }
  const ids = (process.env.CARNALYS_ANALYST_EVAL_COMPARISON_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return ids.length >= 2 ? { surface: "comparison", listingIds: ids.slice(0, 3) } : null;
}

function defaultFiltersForEval() {
  // Kept local so the runner has no import cycle with the search feature.
  return {
    query: "", minPrice: null, maxPrice: null, brands: [], models: [], sources: [],
    fuelType: "" as const, transmission: "" as const, minYear: null, maxYear: null,
    minMileageMil: null, maxMileageMil: null, bodyStyle: "" as const, sellerType: "" as const,
    postedWithin: "" as const, licensePlate: "",
  };
}

function grade(fixture: AnalystEvaluationFixture, run: EvalRun): Omit<EvaluationResult, "toolsUsed" | "answer"> {
  const failures: string[] = [];
  const softMisses: string[] = [];
  const used = new Set(run.toolCalls.map((call) => call.name));
  const answer = run.answer.toLowerCase();

  for (const tool of fixture.expectedTools) {
    if (!used.has(tool)) failures.push(`expected tool ${tool} was not used (used: ${[...used].join(", ") || "none"})`);
  }
  for (const phrase of fixture.forbiddenClaims) {
    if (new RegExp(phrase, "i").test(run.answer)) failures.push(`answer contains a forbidden claim: /${phrase}/i`);
  }
  for (const phrase of fixture.requiredBehaviors) {
    if (!new RegExp(phrase, "i").test(answer)) softMisses.push(`required behaviour keyword not found: /${phrase}/i`);
  }
  for (const message of fixture.check?.(run) ?? []) failures.push(message);

  return { id: fixture.id, passed: failures.length === 0, failures, softMisses };
}

export async function runAnalystEvaluations(options: EvaluationOptions = {}): Promise<EvaluationReport> {
  const provider = options.provider ?? new OpenAIResponsesProvider();
  const userId = options.userId ?? "analyst-eval";
  const contextForSurface = options.contextForSurface ?? defaultContextForSurface;
  const results: EvaluationResult[] = [];

  for (const fixture of analystEvaluationFixtures) {
    const context = contextForSurface(fixture.surface);
    if (!context) continue;
    const recording = new RecordingProvider(provider);
    const request: AnalystRequest = {
      message: fixture.question,
      locale: "en",
      context,
      conversation: fixture.conversation ?? [],
    };
    let answer = "";
    try {
      const result = await runAnalyst({ request, userId, signal: new AbortController().signal, provider: recording });
      answer = result.answer;
    } catch (error) {
      answer = `RUN ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
    const run: EvalRun = { answer, toolCalls: recording.toolCalls };
    const graded = grade(fixture, run);
    results.push({ ...graded, toolsUsed: [...new Set(recording.toolCalls.map((call) => call.name))], answer });
  }

  return { total: results.length, passed: results.filter((result) => result.passed).length, results };
}
