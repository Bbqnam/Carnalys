import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIResponsesProvider } from "./provider";
import { analystToolDefinitions } from "./tool-definitions";

const request = {
  model: "gpt-5.6-luna",
  instructions: "test",
  input: [{ role: "user", content: "test" }],
  tools: analystToolDefinitions,
  safetyIdentifier: "privacy-safe-user",
};

test("OpenAI provider boundary parses tool calls and usage without exposing its key", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = "";
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer server-secret");
    sentBody = String(init?.body);
    return new Response(JSON.stringify({
      id: "resp_test",
      output: [{ type: "function_call", call_id: "call_1", name: "get_listing_analysis", arguments: "{\"listingId\":\"a\",\"includeDescription\":false}" }],
      usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 20 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 10 } },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await new OpenAIResponsesProvider("server-secret", "https://example.test/v1").createResponse(request, new AbortController().signal);
    assert.equal(result.toolCalls[0].name, "get_listing_analysis");
    assert.deepEqual(result.usage, { inputTokens: 120, cachedInputTokens: 20, outputTokens: 30, reasoningTokens: 10 });
    assert.equal(sentBody.includes("server-secret"), false);
    assert.equal(JSON.parse(sentBody).model, "gpt-5.6-luna");
    assert.equal(JSON.parse(sentBody).safety_identifier, "privacy-safe-user");
    assert.equal(JSON.parse(sentBody).store, false);
    assert.equal(JSON.parse(sentBody).parallel_tool_calls, true);
    assert.equal(JSON.parse(sentBody).tools[0].strict, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider streams text deltas and parses the completed response", async () => {
  const originalFetch = globalThis.fetch;
  const frames = [
    'data: {"type":"response.output_text.delta","delta":"Hello"}',
    'data: {"type":"response.output_text.delta","delta":", world"}',
    'data: {"type":"response.completed","response":{"id":"resp_s","output":[{"type":"message","content":[{"type":"output_text","text":"Hello, world"}]}],"usage":{"input_tokens":8,"input_tokens_details":{"cached_tokens":0},"output_tokens":4,"output_tokens_details":{"reasoning_tokens":0}}}}',
  ];
  let sentBody = "";
  globalThis.fetch = async (_input, init) => {
    sentBody = String(init?.body);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const frame of frames) controller.enqueue(encoder.encode(`${frame}\n\n`));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  try {
    const chunks: Array<{ delta: string; first: boolean }> = [];
    const result = await new OpenAIResponsesProvider("server-secret", "https://example.test/v1").createResponse(
      request,
      new AbortController().signal,
      { onTextDelta: (delta, isFirst) => chunks.push({ delta, first: isFirst }) },
    );
    assert.deepEqual(chunks, [
      { delta: "Hello", first: true },
      { delta: ", world", first: false },
    ]);
    assert.equal(result.outputText, "Hello, world");
    assert.equal(result.toolCalls.length, 0);
    assert.deepEqual(result.usage, { inputTokens: 8, cachedInputTokens: 0, outputTokens: 4, reasoningTokens: 0 });
    assert.equal(JSON.parse(sentBody).stream, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider propagates cancellation through fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  const controller = new AbortController();
  try {
    const pending = new OpenAIResponsesProvider("server-secret", "https://example.test/v1").createResponse(request, controller.signal);
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await assert.rejects(pending, /Cancelled/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI provider turns upstream failures into a bounded error without leaking a response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("private upstream details", {
    status: 503,
    headers: { "x-request-id": "request-safe-123" },
  });
  try {
    const provider = new OpenAIResponsesProvider("server-secret", "https://api.openai.test/v1");
    await assert.rejects(
      provider.createResponse({
        model: "gpt-5.6-luna",
        instructions: "safe",
        input: [],
        tools: [],
        safetyIdentifier: "safe-user",
      }, new AbortController().signal),
      (error: unknown) => {
        assert.equal((error as Error).message, "MODEL_REQUEST_FAILED:503:request-safe-123");
        assert.doesNotMatch((error as Error).message, /private upstream details|server-secret/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
