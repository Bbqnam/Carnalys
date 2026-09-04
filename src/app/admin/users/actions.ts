"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/database/prisma";
import { hashPassword } from "@/features/auth/password";
import { requireAdmin } from "@/features/auth/session";

export type CreateTestUserState = {
  username?: string;
  password?: string;
  error?: string;
};

function randomToken(bytes: number) {
  return randomBytes(bytes).toString("hex");
}

export async function setUserAdminAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const makeAdmin = formData.get("makeAdmin") === "true";
  // An admin can always see this page, so refusing to demote yourself is the
  // only thing standing between a slip of the mouse and no admins left.
  if (userId === admin.id && !makeAdmin) return;
  await prisma.user.update({ where: { id: userId }, data: { isAdmin: makeAdmin } });
  revalidatePath("/admin/users");
}

export async function createTestUserAction(
  _state: CreateTestUserState,
  _formData: FormData,
): Promise<CreateTestUserState> {
  await requireAdmin();
  const password = randomBytes(12).toString("base64url");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const username = `test-${randomToken(4)}`;
    const usernameNormalized = username.toLocaleLowerCase("en-US");
    if (await prisma.user.findUnique({ where: { usernameNormalized } })) continue;
    try {
      await prisma.user.create({
        data: { username, usernameNormalized, passwordHash: await hashPassword(password) },
      });
      revalidatePath("/admin/users");
      return { username, password };
    } catch {
      // Unique-constraint race with another request creating the same name — retry.
    }
  }
  return { error: "Could not find a free test username, try again." };
}
