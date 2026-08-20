import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";

// Prisma normally creates SQLite files during migration. Creating the empty
// file first also handles environments where the schema engine cannot create
// a missing datasource path itself.
if (!process.env.DATABASE_URL) {
  const databaseDirectory = path.resolve(process.cwd(), "prisma");
  const databasePath = path.join(databaseDirectory, "dev.db");
  mkdirSync(databaseDirectory, { recursive: true });
  if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));
}
