import assert from "node:assert/strict";
import test from "node:test";
import { defaultSearchFilters } from "@/features/search/search-state";
import { AnalystBudget } from "./budget";
import { EvidenceRegistry } from "./evidence";
import type { AnalystModelProvider, ModelRequest, ModelResponse } from "./provider";
import { finalizeTextAnswer, synthesizeAnswer } from "./synthesis";
import type { AnalystRequest } from "./types";

const request: AnalystRequest = {
  message: "which of these is the best buy",
  locale: "en",
  context: { surface: "search", filters: defaultSearchFilters },
  conversation: [],
};

function stubResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    id: "resp",
    output: [],
    outputText: "",
    toolCalls: [],
    usage: { inputTokens: 5, cachedInputTokens: 1, outputTokens: 7, reasoningTokens: 2 },
    ...overrides,
  };
}

class StubProvider implements AnalystModelProvider {
  readonly requests: ModelRequest[] = [];
  constructor(private readonly reply: (request: ModelRequest) => ModelResponse) {}
  async createResponse(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    return this.reply(request);
  }
}

function freshUsage() {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
}

function registryWithOneItem() {
  const registry = new EvidenceRegistry();
  registry.register({
    tool: "search_inventory",
    data: {},
    evidence: [{ id: "seed", kind: "search", label: "Inventory search", asOf: "2026-09-01T00:00:00.000Z" }],
  });
  return registry;
}

test("synthesizeAnswer forces a tool-free answer from the evidence already gathered", async () => {
  const provider = new StubProvider(() => stubResponse({ outputText: "The V60 looks strongest on price [E1]." }));
  const usage = freshUsage();
  const input: unknown[] = [];

  const result = await synthesizeAnswer({
    provider,
    model: "gpt-test",
    input,
    registry: registryWithOneItem(),
    request,
    budget: new AnalystBudget(3, 4),
    usage,
    userId: "user-1",
    signal: new AbortController().signal,
  });

  assert.equal(result.truncated, true);
  assert.match(result.answer, /V60 looks strongest/);
  assert.equal(result.answer.includes("[E1]"), true);
  assert.equal(provider.requests.length, 1);
  assert.deepEqual(provider.requests[0].tools, []);
  assert.equal(input.length, 1);
  assert.match(JSON.stringify(input[0]), /enough research/);
  assert.equal(usage.outputTokens, 7);
});

test("synthesizeAnswer degrades to the canned notice only when the model returns nothing", async () => {
  const provider = new StubProvider(() => stubResponse({ outputText: "   " }));

  const result = await synthesizeAnswer({
    provider,
    model: "gpt-test",
    input: [],
    registry: registryWithOneItem(),
    request,
    budget: new AnalystBudget(3, 4),
    usage: freshUsage(),
    userId: "user-1",
    signal: new AbortController().signal,
  });

  assert.equal(result.truncated, true);
  assert.match(result.answer, /reached the analysis limit/);
  assert.equal(result.answer.includes("[E1]"), true);
});

test("synthesizeAnswer rejects on an already-aborted signal before calling the model", async () => {
  const provider = new StubProvider(() => stubResponse({ outputText: "x" }));
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(synthesizeAnswer({
    provider,
    model: "gpt-test",
    input: [],
    registry: new EvidenceRegistry(),
    request,
    budget: new AnalystBudget(3, 4),
    usage: freshUsage(),
    userId: "user-1",
    signal: controller.signal,
  }));
  assert.equal(provider.requests.length, 0);
});

test("finalizeTextAnswer appends evidence ids when the model cited none", () => {
  const result = finalizeTextAnswer({
    text: "Prices are broadly in line with the market.",
    registry: registryWithOneItem(),
    request,
    model: "gpt-test",
    budget: new AnalystBudget(3, 4),
    usage: freshUsage(),
    truncated: false,
  });

  assert.equal(result.truncated, false);
  assert.match(result.answer, /Evidence: \[E1\]$/);
});
