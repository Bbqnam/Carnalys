import "dotenv/config";

import {
  MARKET_COHORT_MINIMUM_SIZE,
  addUtcDays,
  previousCompletedUtcDate,
  startOfUtcDay,
} from "@/domain/market/historical-market";
import { buildMarketSnapshotsForDate } from "@/infrastructure/database/market-snapshot-repository";
import { prisma } from "@/infrastructure/database/prisma";

function argument(name: string) {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.split("=", 2)[1];
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD.`);
  }
  return parsed;
}

function parseMinimum(value: string | undefined) {
  if (!value) return MARKET_COHORT_MINIMUM_SIZE;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 2) {
    throw new Error("--minimum must be an integer of at least 2.");
  }
  return parsed;
}

async function main() {
  const defaultDate = previousCompletedUtcDate();
  const singleDate = argument("date");
  const from = startOfUtcDay(
    parseDate(singleDate ?? argument("from"), defaultDate),
  );
  const to = startOfUtcDay(
    parseDate(singleDate ?? argument("to"), from),
  );
  const minimum = parseMinimum(argument("minimum"));
  if (to < from) throw new Error("--to must be on or after --from.");

  let date = from;
  let totalCohorts = 0;
  while (date <= to) {
    const result = await buildMarketSnapshotsForDate(date, minimum);
    totalCohorts += result.cohortCount;
    console.log(
      `${result.snapshotDate.toISOString().slice(0, 10)}: ${result.cohortCount} cohorts (minimum ${result.minimumCohortSize}), watermark ${result.sourceWatermark.toISOString()}.`,
    );
    date = addUtcDays(date, 1);
  }
  console.log(`Built ${totalCohorts} daily market snapshot rows.`);
}

main()
  .catch((error: unknown) => {
    console.error("Market snapshot build failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
