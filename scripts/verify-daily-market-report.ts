import "dotenv/config";
import { buildDailyMarketReport } from "../src/application/reporting/daily-market-report";
import { prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const report = await buildDailyMarketReport(new Date(), 0);
  if (!report.reportDate || !Number.isFinite(report.activeListings)) {
    throw new Error("Daily market report returned an invalid result.");
  }
  console.log(`Daily market report smoke test passed for ${report.reportDate} with ${report.likelySold.count} likely sold records.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
