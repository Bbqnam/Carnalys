import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/infrastructure/database/prisma";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { EditUserForm } from "./edit-user-form";
import { DeleteUserButton } from "./delete-user-button";

export const metadata = { title: "Edit user · Carnalys Admin" };
export const dynamic = "force-dynamic";

export default async function AdminEditUserPage({ params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/users");
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true },
  });
  if (!user) notFound();

  return (
    <div>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-2.5" href="/">
            <CarnalysMark className="size-8 text-ink" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">Carnalys Admin</span>
          </Link>
          <Link
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-muted"
            href="/admin/users"
          >
            Back to users
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-5 pb-24 pt-9 sm:px-8 lg:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
          Private administrator view
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">{user.username}</h1>
        <p className="mt-2 text-sm text-ink-muted">{user.isAdmin ? "Admin account" : "User account"}</p>

        <section className="mt-7 rounded-[1.5rem] border border-border bg-surface p-6 shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
          <h2 className="text-lg font-semibold text-ink">Username &amp; password</h2>
          <p className="mt-1 text-xs text-ink-subtle">Leave the password blank to leave it unchanged.</p>
          <div className="mt-5">
            <EditUserForm userId={user.id} username={user.username} />
          </div>
        </section>

        {user.id !== admin.id ? (
          <section className="mt-6 rounded-[1.5rem] border border-negative/25 bg-surface p-6">
            <h2 className="text-lg font-semibold text-ink">Danger zone</h2>
            <p className="mt-1 max-w-md text-xs text-ink-subtle">
              Permanently deletes this account, along with its saved cars, saved searches and sessions.
            </p>
            <div className="mt-4">
              <DeleteUserButton userId={user.id} username={user.username} />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
