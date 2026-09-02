import { spawnSync } from "node:child_process";

const obsoleteMigrations = [
  "20260902110000_add_verified_missing_observation_kind",
  "20260902110500_support_verified_missing_observations",
];

for (const migration of obsoleteMigrations) {
  const result = spawnSync(
    "npx",
    ["prisma", "migrate", "resolve", "--rolled-back", migration],
    { stdio: "inherit", shell: process.platform === "win32" },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    console.log(`Cleared failed report migration: ${migration}`);
  }
}
