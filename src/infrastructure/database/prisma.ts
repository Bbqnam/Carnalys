import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaInitialization?: Promise<void>;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

export function initializeDatabase() {
  if (!globalForPrisma.prismaInitialization) {
    globalForPrisma.prismaInitialization = prisma.$connect();
  }
  return globalForPrisma.prismaInitialization;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
