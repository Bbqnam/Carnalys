import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/session";
import { SettingsContent } from "@/features/auth/settings-content";
import { prisma } from "@/infrastructure/database/prisma";

export const metadata = { title: "Settings · Carnalys" };

export default async function SettingsPage() {
  const account = await getCurrentUser();
  if (!account) redirect("/login?redirectTo=/settings");
  const savedSearches = await prisma.savedSearch.findMany({
    where: { userId: account.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, url: true, updatedAt: true },
  });

  return (
    <SettingsContent
      account={account}
      savedSearches={savedSearches.map((search) => ({
        ...search,
        updatedAt: search.updatedAt.toISOString(),
      }))}
    />
  );
}
