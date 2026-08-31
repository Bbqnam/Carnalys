import "dotenv/config";
import { defineConfig } from "prisma/config";
import { enforceVerifiedPostgresSsl } from "./src/infrastructure/database/connection-string";

const configuredDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: configuredDatabaseUrl
      ? enforceVerifiedPostgresSsl(configuredDatabaseUrl)
      : configuredDatabaseUrl,
  },
});
