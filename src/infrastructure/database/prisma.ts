import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { enforceVerifiedPostgresSsl } from "./connection-string";

const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const databaseUrl = enforceVerifiedPostgresSsl(configuredDatabaseUrl);

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaInitialization?: Promise<void>;
};

function createPrismaClient() {
  // `pg.Pool`'s default max is 10, which under-serves the concurrent listing
  // writes during a full reconciliation (see writeConcurrency in
  // listing-write-repository.ts) — raised with room to spare for the
  // process's other concurrent queries (checkpoint/facet updates) that share
  // this same pool.
  const adapter = new PrismaPg({ connectionString: databaseUrl, max: 15 });
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
