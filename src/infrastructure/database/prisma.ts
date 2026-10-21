import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
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
  databasePool?: Pool;
};

function createPrismaClient() {
  // `pg.Pool`'s default max is 10, which under-serves the concurrent listing
  // writes during a full reconciliation (see writeConcurrency in
  // listing-write-repository.ts) — raised with room to spare for the
  // process's other concurrent queries (checkpoint/facet updates) that share
  // this same pool. Overridable via `PRISMA_POOL_MAX` so a serverless request
  // deployment can run leaner (each instance opens its own pool) without
  // touching the sync scripts, which want the headroom.
  const defaultMax = process.env.VERCEL ? 8 : 15;
  const max = Number(process.env.PRISMA_POOL_MAX) || defaultMax;
  const pool = globalForPrisma.databasePool ?? new Pool({
    connectionString: databaseUrl,
    max,
    // Release idle connections quickly on Fluid Compute. The Neon pooler is
    // still responsible for multiplexing these short-lived backend sessions.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

  if (!globalForPrisma.databasePool) {
    // Lets Vercel keep the function instance alive long enough for pg to close
    // idle connections cleanly instead of leaving a burst of serverless
    // instances holding open pools.
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalForPrisma.databasePool = pool;
  }

  const adapter = new PrismaPg(pool, { disposeExternalPool: false });
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
