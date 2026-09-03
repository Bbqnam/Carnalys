import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/features/auth/session";
import { authenticateAnalystRequest } from "@/features/analyst/access";
import { runAnalyst } from "@/features/analyst/orchestrator";
import { selectAnalystModel } from "@/features/analyst/models";
import { estimateModelCostMicroUsd, checkAnalystRateLimit, recordAnalystUsage } from "@/features/analyst/usage";
import type { AnalystStreamEvent } from "@/features/analyst/types";
import { AnalystValidationError, parseAnalystRequest } from "@/features/analyst/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const maximumRequestBytes = 20_000;

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

export async function POST(request: Request) {
  const user = await authenticateAnalystRequest(requireCurrentUser);
  if (!user) return jsonError("Authentication required.", 401);

  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > maximumRequestBytes) return jsonError("Request too large.", 413);

  let parsed;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > maximumRequestBytes) {
      return jsonError("Request too large.", 413);
    }
    parsed = parseAnalystRequest(JSON.parse(body));
  } catch (error) {
    const message = error instanceof AnalystValidationError ? error.message : "Invalid request body.";
    return jsonError(message, 400);
  }

  const rate = await checkAnalystRateLimit(user.id);
  if (!rate.allowed) {
    return jsonError("Analyst request limit reached. Try again shortly.", 429, {
      "retry-after": rate.retryAfterSeconds.toString(),
    });
  }

  const requestId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Math.min(55_000, Math.max(5_000, Number.parseInt(process.env.CARNALYS_ANALYST_TIMEOUT_MS ?? "45000", 10) || 45_000));
  const timeout = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  const abortFromBrowser = () => controller.abort(request.signal.reason ?? new DOMException("Aborted", "AbortError"));
  request.signal.addEventListener("abort", abortFromBrowser, { once: true });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let closed = false;
      const send = (event: AnalystStreamEvent) => {
        if (closed) return;
        try {
          streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      send({ type: "status", message: parsed.locale === "sv" ? "Startar Carnalys Analyst…" : "Starting Carnalys Analyst…", requestId });
      let status = "failed";
      let streamedAny = false;
      let telemetry: Awaited<ReturnType<typeof runAnalyst>> | undefined;
      try {
        telemetry = await runAnalyst({
          request: parsed,
          userId: user.id,
          signal: controller.signal,
          onStatus: (message) => send({ type: "status", message, requestId }),
          onAnswerDelta: (delta, isFirst) => {
            streamedAny = true;
            send({ type: "delta", delta, requestId, ...(isFirst ? { replace: true } : {}) });
          },
        });
        // The streamed chunks are raw model output; `telemetry.answer` is the
        // same text with its evidence citations validated (and an evidence line
        // appended when the model cited none). Reconcile the client to that.
        if (streamedAny) {
          send({ type: "final", answer: telemetry.answer, requestId });
        } else {
          send({ type: "delta", delta: telemetry.answer, requestId, replace: true });
        }
        send({ type: "evidence", evidence: telemetry.evidence, truncated: telemetry.truncated, requestId });
        send({ type: "done", requestId });
        status = "completed";
      } catch (error) {
        if (!request.signal.aborted) {
          const configured = error instanceof Error && error.message === "MODEL_NOT_CONFIGURED";
          const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError";
          send({
            type: "error",
            message: configured
              ? "Carnalys Analyst is not configured yet."
              : timedOut
                ? "The analysis timed out. Try a narrower question."
                : "The analysis could not be completed safely. Please try again.",
            requestId,
          });
          status = timedOut ? "timed_out" : configured ? "not_configured" : "failed";
        } else {
          status = "cancelled";
        }
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", abortFromBrowser);
        const model = telemetry?.model ?? selectAnalystModel(parsed.message);
        const usage = telemetry?.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
        await recordAnalystUsage({
          userId: user.id,
          requestId,
          surface: parsed.context.surface,
          model,
          status,
          modelTurns: telemetry?.modelTurns ?? 0,
          toolCalls: telemetry?.toolCalls ?? 0,
          usage,
          estimatedCostMicroUsd: estimateModelCostMicroUsd(model, usage),
          durationMs: Date.now() - startedAt,
        });
        closed = true;
        try {
          streamController.close();
        } catch {
          // Browser cancellation may already have closed the stream.
        }
      }
    },
    cancel(reason) {
      controller.abort(reason);
      clearTimeout(timeout);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
