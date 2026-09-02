import "dotenv/config";
import { hashPassword } from "../src/features/auth/password";
import { initializeDatabase, prisma } from "../src/infrastructure/database/prisma";

async function main() {
  const username = process.env.CARNALYS_ADMIN_USERNAME?.trim();
  const password = process.env.CARNALYS_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("Set CARNALYS_ADMIN_USERNAME and CARNALYS_ADMIN_PASSWORD before running this command.");
  }
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) throw new Error("Invalid administrator username.");
  if (password.length < 12 || password.length > 128) throw new Error("Administrator password must be 12 to 128 characters.");
  await initializeDatabase();
  await prisma.user.upsert({
    where: { usernameNormalized: username.toLocaleLowerCase("en-US") },
    create: {
      username,
      usernameNormalized: username.toLocaleLowerCase("en-US"),
      passwordHash: await hashPassword(password),
      isAdmin: true,
    },
    update: { passwordHash: await hashPassword(password), isAdmin: true },
  });
  console.log(`Administrator ${username} is ready. Remove CARNALYS_ADMIN_PASSWORD from the environment now.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
