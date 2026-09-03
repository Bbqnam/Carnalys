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
}

export interface AnalystModelProvider {
  createResponse(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
}

function integer(value: unknown) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export class OpenAIResponsesProvider implements AnalystModelProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  ) {}

  async createResponse(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    if (!this.apiKey) throw new Error("MODEL_NOT_CONFIGURED");
    // A tool-free call (the final synthesis pass) must not ship an empty tool
    // list with tool_choice: "auto" — the model is being forced to answer now.
    const toolFields = request.tools.length > 0
      ? { tools: request.tools, tool_choice: "auto", parallel_tool_calls: false }
      : { tool_choice: "none" };
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        ...toolFields,
        reasoning: { effort: process.env.CARNALYS_ANALYST_REASONING_EFFORT ?? "low" },
        text: { verbosity: "low" },
        max_output_tokens: 1_200,
        store: false,
        safety_identifier: request.safetyIdentifier,
      }),
      signal,
    });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      throw new Error(`MODEL_REQUEST_FAILED:${response.status}${requestId ? `:${requestId}` : ""}`);
    }
    const payload = record(await response.json());
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
}
