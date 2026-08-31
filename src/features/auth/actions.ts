"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/database/prisma";
import { localeCookieName } from "@/features/search/locale";
import { hashPassword, verifyPassword } from "./password";
import {
  createSession,
  deleteCurrentSession,
  getCurrentUser,
  requireCurrentUser,
} from "./session";

export interface AuthActionState {
  error?: string;
  fieldErrors?: { username?: string; password?: string };
}

export interface SettingsActionState {
  error?: string;
  success?: boolean;
}

export interface SavedSearchActionState extends SettingsActionState {
  savedSearchId?: string;
}

function normalizedUsername(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function displayUsername(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function passwordValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function safeRedirect(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function validateCredentials(username: string, password: string): AuthActionState | null {
  const fieldErrors: AuthActionState["fieldErrors"] = {};
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) {
    fieldErrors.username = "Use 3–24 letters, numbers, dashes or underscores.";
  }
  if (password.length < 8 || password.length > 128) {
    fieldErrors.password = "Use a password between 8 and 128 characters.";
  }
  return Object.keys(fieldErrors).length ? { fieldErrors } : null;
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const username = displayUsername(formData.get("username"));
  const normalized = normalizedUsername(formData.get("username"));
  const password = passwordValue(formData.get("password"));
  const validation = validateCredentials(username, password);
  if (validation) return validation;

  if (await prisma.user.findUnique({ where: { usernameNormalized: normalized } })) {
    return { fieldErrors: { username: "That username is already taken." } };
  }

  let user: { id: string };
  try {
    user = await prisma.user.create({
      data: {
        username,
        usernameNormalized: normalized,
        passwordHash: await hashPassword(password),
        locale: formData.get("locale") === "sv" ? "sv" : "en",
      },
      select: { id: true },
    });
  } catch {
    return { fieldErrors: { username: "That username is already taken." } };
  }

  await createSession(user.id);
  redirect(safeRedirect(formData.get("redirectTo")));
}

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const normalized = normalizedUsername(formData.get("username"));
  const password = passwordValue(formData.get("password"));
  const user = await prisma.user.findUnique({ where: { usernameNormalized: normalized } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "The username or password is incorrect." };
  }

  await createSession(user.id);
  (await cookies()).set(localeCookieName, user.locale === "sv" ? "sv" : "en", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  redirect(safeRedirect(formData.get("redirectTo")));
}

export async function signOutAction() {
  await deleteCurrentSession();
  redirect("/");
}

export async function setFavoriteAction(listingId: string, saved: boolean) {
  const user = await getCurrentUser();
  if (!user || !listingId) return { authenticated: false } as const;

  const key = { userId_listingId: { userId: user.id, listingId } };
  if (!saved) {
    await prisma.userFavorite.deleteMany({
      where: { userId: user.id, listingId },
    });
  } else {
    const listing = await prisma.listingRecord.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (listing) {
      await prisma.userFavorite.upsert({
        where: key,
        create: { userId: user.id, listingId },
        update: {},
      });
    }
  }
  revalidatePath("/saved");
  return { authenticated: true, saved } as const;
}

export async function importGuestFavoritesAction(listingIds: readonly string[]) {
  const user = await getCurrentUser();
  if (!user) return { imported: 0 };
  const ids = [...new Set(listingIds.filter((id) => typeof id === "string"))].slice(0, 200);
  const listings = await prisma.listingRecord.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (listings.length) {
    await prisma.userFavorite.createMany({
      data: listings.map(({ id }) => ({ userId: user.id, listingId: id })),
      skipDuplicates: true,
    });
  }
  return { imported: listings.length };
}

export async function updateSettingsAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireCurrentUser();
  const locale = formData.get("locale") === "sv" ? "sv" : "en";
  const requestedTheme = formData.get("theme");
  const theme = requestedTheme === "dark" ? "dark" : "light";
  const viewMode = formData.get("viewMode") === "list" ? "list" : "grid";

  await prisma.user.update({
    where: { id: user.id },
    data: { locale, theme, viewMode },
  });
  (await cookies()).set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updatePasswordAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireCurrentUser();
  const currentPassword = passwordValue(formData.get("currentPassword"));
  const newPassword = passwordValue(formData.get("newPassword"));
  if (newPassword.length < 8 || newPassword.length > 128) {
    return { error: "The new password must be between 8 and 128 characters." };
  }
  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
    return { error: "Your current password is incorrect." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  return { success: true };
}

export async function saveSearchAction(
  _state: SavedSearchActionState,
  formData: FormData,
): Promise<SavedSearchActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to save this search." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 50);
  const url = String(formData.get("url") ?? "").trim().slice(0, 1500);
  if (!name) return { error: "Give this search a name." };
  if (!url.startsWith("/") || url.startsWith("//")) return { error: "This search could not be saved." };

  const savedSearch = await prisma.savedSearch.create({ data: { userId: user.id, name, url } });
  revalidatePath("/settings");
  return { success: true, savedSearchId: savedSearch.id };
}

export async function deleteSavedSearchAction(formData: FormData) {
  const user = await requireCurrentUser();
  const id = String(formData.get("id") ?? "");
  await prisma.savedSearch.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/settings");
}
