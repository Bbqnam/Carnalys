import type { AnalystFunctionTool } from "./tool-definitions";

export interface ModelToolCall {
  callId: string;
  name: string;
  argumentsJson: string;
}

export interface ModelUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export interface ModelResponse {
  id: string;
  output: readonly unknown[];
  outputText: string;
  toolCalls: readonly ModelToolCall[];
  usage: ModelUsage;
}

export interface ModelRequest {
  model: string;
  instructions: string;
  input: readonly unknown[];
  tools: readonly AnalystFunctionTool[];
  safetyIdentifier: string;
  /** Falls back to CARNALYS_ANALYST_REASONING_EFFORT when omitted. */
  reasoningEffort?: string;
}

/**
 * When supplied, the provider asks the API to stream and calls `onTextDelta`
 * for each chunk of the model's visible answer as it arrives. `isFirst` marks
 * the first text chunk of a response so a consumer can replace rather than
 * append (a turn that ends up calling a tool emits little or no text, so its
 * few characters are safely superseded by the turn that actually answers).
 */
export interface StreamCallbacks {
  onTextDelta: (delta: string, isFirst: boolean) => void;
}

export interface AnalystModelProvider {
  createResponse(
    request: ModelRequest,
    signal: AbortSignal,
    stream?: StreamCallbacks,
  ): Promise<ModelResponse>;
}

function integer(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Turns a completed Responses payload (streamed or not) into a ModelResponse. */
function buildModelResponse(payload: Record<string, unknown>): ModelResponse {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const toolCalls = output.flatMap((item) => {
    const value = record(item);
    return value.type === "function_call" && typeof value.call_id === "string" && typeof value.name === "string"
      ? [{ callId: value.call_id, name: value.name, argumentsJson: typeof value.arguments === "string" ? value.arguments : "{}" }]
      : [];
  });
  const usage = record(payload.usage);
  const inputDetails = record(usage.input_tokens_details);
  const outputDetails = record(usage.output_tokens_details);
  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : output.flatMap((item) => {
        const value = record(item);
        if (value.type !== "message" || !Array.isArray(value.content)) return [];
        return value.content.flatMap((content) => {
          const part = record(content);
          return part.type === "output_text" && typeof part.text === "string" ? [part.text] : [];
        });
      }).join("");
  return {
    id: typeof payload.id === "string" ? payload.id : "response",
    output,
    outputText,
    toolCalls,
    usage: {
      inputTokens: integer(usage.input_tokens),
      cachedInputTokens: integer(inputDetails.cached_tokens),
      outputTokens: integer(usage.output_tokens),
      reasoningTokens: integer(outputDetails.reasoning_tokens),
    },
  };
}

async function readEventStream(
  response: Response,
  onTextDelta: StreamCallbacks["onTextDelta"],
): Promise<ModelResponse> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("MODEL_REQUEST_FAILED:no-stream-body");
  const decoder = new TextDecoder();
  let buffer = "";
  let sawText = false;
  let completed: Record<string, unknown> | null = null;
  let streamedText = "";

  const handle = (data: string) => {
    if (!data || data === "[DONE]") return;
    let event: Record<string, unknown>;
    try {
      event = record(JSON.parse(data));
    } catch {
      return;
    }
    const type = event.type;
    if (type === "response.output_text.delta") {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) return;
      streamedText += delta;
      onTextDelta(delta, !sawText);
      sawText = true;
    } else if (type === "response.completed" || type === "response.incomplete") {
      completed = record(event.response);
    } else if (type === "response.failed" || type === "error") {
      const detail = record(event.response);
      const message = typeof event.message === "string"
        ? event.message
        : typeof record(detail.error).message === "string"
          ? String(record(detail.error).message)
          : "stream-error";
      throw new Error(`MODEL_REQUEST_FAILED:${message}`);
    }
  };

  // SSE frames are separated by a blank line; each `data:` line carries a JSON
  // event whose own `type` field is what we switch on, so `event:` lines are
  // ignored.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) handle(line.slice(5).trim());
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data:")) handle(line.slice(5).trim());
    }
  }

  if (completed) return buildModelResponse(completed);
  // Stream ended without a terminal frame: fall back to what we accumulated.
  return {
    id: "response",
    output: [],
    outputText: streamedText,
    toolCalls: [],
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
  };
}

export class OpenAIResponsesProvider implements AnalystModelProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ) {}

  async createResponse(
    request: ModelRequest,
    signal: AbortSignal,
    stream?: StreamCallbacks,
  ): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error("MODEL_NOT_CONFIGURED");
    // A tool-free call (the final synthesis pass) must not ship an empty tool
    // list with tool_choice: "auto" — the model is being forced to answer now.
    // Parallel calls let one turn request, say, an independent market check on
    // two listings at once instead of spending a whole extra round-trip on it.
    const toolFields = request.tools.length > 0
      ? { tools: request.tools, tool_choice: "auto", parallel_tool_calls: true }
      : { tool_choice: "none" };
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(stream ? { accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        ...toolFields,
        reasoning: { effort: request.reasoningEffort ?? process.env.CARNALYS_ANALYST_REASONING_EFFORT ?? "low" },
        text: { verbosity: "low" },
        max_output_tokens: 1_200,
        store: false,
        stream: Boolean(stream),
        safety_identifier: request.safetyIdentifier,
      }),
      signal,
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      throw new Error(`MODEL_REQUEST_FAILED:${response.status}${requestId ? `:${requestId}` : ""}`);
    }
    if (stream) return readEventStream(response, stream.onTextDelta);
    return buildModelResponse(record(await response.json()));
  }
}
