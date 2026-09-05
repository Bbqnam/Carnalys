import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/infrastructure/database/prisma";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { setUserAdminAction } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata = { title: "Users · Carnalys Admin" };
export const dynamic = "force-dynamic";

const userCap = 300;

const dateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  dateStyle: "medium",
});

export default async function AdminUsersPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/users");
  }

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: userCap,
      select: { id: true, username: true, isAdmin: true, locale: true, createdAt: true },
    }),
  ]);

  return (
    <div>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-2.5" href="/">
            <CarnalysMark className="size-8 text-ink" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">Carnalys Admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-muted"
              href="/admin/market-report"
            >
              Market report
            </Link>
            <Link
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-muted"
              href="/admin/insurance"
            >
              Insurance data
            </Link>
            <Link
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-muted"
              href="/settings"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-9 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
              Private administrator view
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Users</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {total.toLocaleString("en-US")} registered {total === 1 ? "account" : "accounts"}
              {total > users.length ? ` · showing the most recent ${users.length}` : ""}
            </p>
          </div>
          <CreateUserForm />
        </div>

        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead className="bg-surface-subtle text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
              <tr>
                {["Username", "Role", "Joined", "Language", ""].map((h) => (
                  <th className="px-3 py-2.5 font-semibold" key={h || "actions"}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => {
                const isSelf = user.id === admin.id;
                return (
                  <tr className="transition hover:bg-surface-subtle" key={user.id}>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-ink">
                      {user.username}
                      {isSelf ? <span className="ml-2 text-[11px] font-normal text-ink-subtle">you</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                          user.isAdmin ? "bg-accent-soft text-accent-strong" : "bg-surface-muted text-ink-muted"
                        }`}
                      >
                        {user.isAdmin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">
                      {dateTime.format(user.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-ink-muted">{user.locale.toUpperCase()}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-muted hover:text-ink"
                          href={`/admin/users/${user.id}`}
                        >
                          Edit
                        </Link>
                        <form action={setUserAdminAction}>
                          <input name="userId" type="hidden" value={user.id} />
                          <input name="makeAdmin" type="hidden" value={String(!user.isAdmin)} />
                          <button
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isSelf && user.isAdmin}
                            title={isSelf && user.isAdmin ? "You can't demote yourself" : undefined}
                            type="submit"
                          >
                            {user.isAdmin ? "Demote" : "Promote"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
