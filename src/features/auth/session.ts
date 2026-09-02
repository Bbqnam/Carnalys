import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/infrastructure/database/prisma";
import { assertAdmin } from "./admin-guard";

export { assertAdmin } from "./admin-guard";

export const sessionCookieName = "carnalys-session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function digestSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export interface AccountUser {
  id: string;
  username: string;
  locale: "en" | "sv";
  theme: "light" | "dark";
  isAdmin: boolean;
  viewMode: "grid" | "list";
}

function accountUser(user: {
  id: string;
  username: string;
  locale: string;
  theme: string;
  isAdmin: boolean;
  viewMode: string;
}): AccountUser {
  return {
    id: user.id,
    username: user.username,
    locale: user.locale === "sv" ? "sv" : "en",
    theme: user.theme === "dark" ? "dark" : "light",
    isAdmin: user.isAdmin,
    viewMode: user.viewMode === "list" ? "list" : "grid",
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);

  await prisma.userSession.create({
    data: { id: digestSessionToken(token), userId, expiresAt },
  });

  (await cookies()).set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionLifetimeSeconds,
    priority: "high",
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await prisma.userSession.deleteMany({
      where: { id: digestSessionToken(token) },
    });
  }
  cookieStore.delete(sessionCookieName);
}

export async function getCurrentUser(): Promise<AccountUser | null> {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { id: digestSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return accountUser(session.user);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return user;
}

export async function getAccountBootstrap() {
  const user = await getCurrentUser();
  if (!user) return { user: null, favoriteIds: [] as string[] };

  const favorites = await prisma.userFavorite.findMany({
    where: { userId: user.id },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
  });
  return { user, favoriteIds: favorites.map((favorite) => favorite.listingId) };
}

export async function requireAdmin() {
  return assertAdmin(await getCurrentUser());
}
