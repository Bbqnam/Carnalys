import "server-only";

import { createHash } from "node:crypto";
import { initializeDatabase, prisma } from "@/infrastructure/database/prisma";
import type { AnalystSurface } from "./types";
import type { ModelUsage } from "./provider";
import { FixedWindowRequestLimiter } from "./rate-limit";

const localLimiter = new FixedWindowRequestLimiter();

function environmentInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function privacySafeUserIdentifier(userId: string) {
  return createHash("sha256").update(`carnalys-analyst:${userId}`).digest("base64url").slice(0, 32);
}

export async function checkAnalystRateLimit(userId: string, now = new Date()) {
  const maximum = environmentInteger("CARNALYS_ANALYST_REQUESTS_PER_10_MINUTES", 10);
  const windowMs = 10 * 60_000;
  const cutoff = now.valueOf() - windowMs;
  const local = localLimiter.consume(userId, now.valueOf(), maximum, windowMs);
  if (!local.allowed) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(local.retryAfterMs / 1_000)) };

  try {
    await initializeDatabase();
    const durableCount = await prisma.analystUsageLog.count({
      where: { userId, createdAt: { gte: new Date(cutoff) } },
    });
    if (durableCount >= maximum) return { allowed: false, retryAfterSeconds: 60 };
  } catch (error) {
    // During a staged deployment the application can start before the additive
    // migration reaches every environment. The per-instance limiter still
    // fails safely without blocking all Analyst traffic.
    console.warn("Analyst durable rate-limit lookup unavailable.", error instanceof Error ? error.message : "unknown");
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export interface AnalystUsageRecord {
  userId: string;
  requestId: string;
  surface: AnalystSurface;
  model: string;
  status: string;
  modelTurns: number;
  toolCalls: number;
  usage: ModelUsage;
  estimatedCostMicroUsd: number;
  durationMs: number;
}

export async function recordAnalystUsage(record: AnalystUsageRecord) {
  const metadata = {
    requestId: record.requestId,
    surface: record.surface,
    model: record.model,
    status: record.status,
    modelTurns: record.modelTurns,
    toolCalls: record.toolCalls,
    ...record.usage,
    estimatedCostMicroUsd: record.estimatedCostMicroUsd,
    durationMs: record.durationMs,
  };
  console.info("Carnalys Analyst usage", metadata);
  try {
    await initializeDatabase();
    await prisma.analystUsageLog.create({
      data: {
        userId: record.userId,
        requestId: record.requestId,
        surface: record.surface,
        model: record.model,
        status: record.status,
        modelTurns: record.modelTurns,
        toolCalls: record.toolCalls,
        inputTokens: record.usage.inputTokens,
        cachedInputTokens: record.usage.cachedInputTokens,
        outputTokens: record.usage.outputTokens,
        reasoningTokens: record.usage.reasoningTokens,
        estimatedCostMicroUsd: record.estimatedCostMicroUsd,
        durationMs: record.durationMs,
      },
    });
  } catch (error) {
    console.error("Carnalys Analyst usage persistence failed.", error instanceof Error ? error.message : "unknown");
  }
}

export function estimateModelCostMicroUsd(model: string, usage: ModelUsage) {
  const luna = { input: 0.2, cached: 0.02, output: 1.2 };
  const terra = { input: 2, cached: 0.2, output: 12 };
  const rates = model.includes("terra") ? terra : luna;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const usd = (uncachedInput * rates.input + usage.cachedInputTokens * rates.cached + usage.outputTokens * rates.output) / 1_000_000;
  return Math.round(usd * 1_000_000);
}
