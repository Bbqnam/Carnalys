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
    assert.equal(JSON.parse(sentBody).parallel_tool_calls, false);
    assert.equal(JSON.parse(sentBody).tools[0].strict, true);
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
