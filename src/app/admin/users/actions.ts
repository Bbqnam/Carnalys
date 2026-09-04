"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/database/prisma";
import { hashPassword } from "@/features/auth/password";
import { requireAdmin } from "@/features/auth/session";

export type UserFormState = {
  error?: string;
  success?: boolean;
};

// Same shape signUpAction enforces for a self-service account.
const usernamePattern = /^[\p{L}\p{N}_-]{3,24}$/u;

function usernameError(username: string): string | null {
  return usernamePattern.test(username) ? null : "Use 3–24 letters, numbers, dashes or underscores.";
}

function passwordError(password: string): string | null {
  return password.length >= 8 && password.length <= 128 ? null : "Use a password between 8 and 128 characters.";
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

export async function createUserAction(
  _state: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const invalidUsername = usernameError(username);
  if (invalidUsername) return { error: invalidUsername };
  const invalidPassword = passwordError(password);
  if (invalidPassword) return { error: invalidPassword };

  const usernameNormalized = username.toLocaleLowerCase("en-US");
  if (await prisma.user.findUnique({ where: { usernameNormalized } })) {
    return { error: "That username is already taken." };
  }
  await prisma.user.create({
    data: { username, usernameNormalized, passwordHash: await hashPassword(password) },
  });
  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateUserAction(
  _state: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const invalidUsername = usernameError(username);
  if (invalidUsername) return { error: invalidUsername };
  if (password) {
    const invalidPassword = passwordError(password);
    if (invalidPassword) return { error: invalidPassword };
  }

  const usernameNormalized = username.toLocaleLowerCase("en-US");
  const holder = await prisma.user.findUnique({ where: { usernameNormalized } });
  if (holder && holder.id !== userId) return { error: "That username is already taken." };

  await prisma.user.update({
    where: { id: userId },
    data: {
      username,
      usernameNormalized,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  // Deleting your own signed-in account mid-request is a footgun, not a feature.
  if (userId === admin.id) return;
  await prisma.user.delete({ where: { id: userId } }).catch(() => {
    // Already gone — treat it as success rather than surfacing a stale error.
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
