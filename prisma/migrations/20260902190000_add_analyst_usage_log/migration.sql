-- Metadata-only usage and cost telemetry for the authenticated Analyst API.
-- User prompts, model answers, evidence payloads, and reasoning are never stored.
CREATE TABLE "AnalystUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "modelTurns" INTEGER NOT NULL,
    "toolCalls" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cachedInputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "reasoningTokens" INTEGER NOT NULL,
    "estimatedCostMicroUsd" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalystUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalystUsageLog_requestId_key" ON "AnalystUsageLog"("requestId");
CREATE INDEX "AnalystUsageLog_userId_createdAt_idx" ON "AnalystUsageLog"("userId", "createdAt");
CREATE INDEX "AnalystUsageLog_createdAt_idx" ON "AnalystUsageLog"("createdAt");

ALTER TABLE "AnalystUsageLog"
ADD CONSTRAINT "AnalystUsageLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
