import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl =
  process.env.DATABASE_URL ??
  `file://${path.resolve(process.cwd(), "prisma/dev.db")}`;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaInitialization?: Promise<void>;
};

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl, timeout: 10_000 });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export function initializeDatabase() {
  if (!globalForPrisma.prismaInitialization) {
    globalForPrisma.prismaInitialization = (async () => {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000");
      await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
    })();
  }
  return globalForPrisma.prismaInitialization;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
