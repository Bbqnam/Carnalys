import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const localDatabaseUrl = `file://${path.resolve(process.cwd(), "prisma/dev.db")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
