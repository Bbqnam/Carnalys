import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { listReliabilityProfiles } from "@/infrastructure/database/reliability-repository";
import {
  deleteReliabilityIssueAction,
  deleteReliabilityProfileAction,
  deleteReliabilitySourceAction,
} from "./actions";
import {
  AddReliabilityIssueForm,
  AddReliabilitySourceForm,
  CreateReliabilityProfileForm,
} from "./reliability-forms";
import { ConfirmDeleteButton } from "./confirm-delete-button";

export const metadata = { title: "Reliability intelligence · Carnalys Admin" };
export const dynamic = "force-dynamic";

const deleteButton = "text-[10px] font-semibold text-negative underline-offset-2 hover:underline";

export default async function ReliabilityAdminPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/reliability");
  }
  const profiles = await listReliabilityProfiles();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-2.5" href="/">
            <CarnalysMark className="size-8 text-ink" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">Carnalys Admin</span>
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/admin/source-value">Source value</Link>
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/admin/market-report">Market report</Link>
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-9 sm:px-8 lg:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">Private administrator view</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Reliability intelligence</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Curate known risks for an exact model-year and powertrain cohort. Unsourced drafts stay hidden from buyers; attach evidence before publication.
        </p>

        <div className="mt-8">
          <CreateReliabilityProfileForm />
        </div>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">Profiles</h2>
              <p className="mt-1 text-xs text-ink-muted">{profiles.length} curated cohorts</p>
            </div>
          </div>

          <div className="mt-4 grid gap-5">
            {profiles.map((profile) => (
              <article className="rounded-2xl border border-border bg-surface p-5" key={profile.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-ink">{profile.make} {profile.model}</h3>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${profile.sources.length ? "bg-positive-soft text-positive" : "bg-surface-muted text-ink-subtle"}`}>
                        {profile.sources.length ? "Published" : "Draft · add evidence"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-subtle">
                      {profile.modelYearFrom}–{profile.modelYearTo}
                      {profile.generation ? ` · ${profile.generation}` : ""}
                      {profile.fuelType ? ` · ${profile.fuelType}` : ""}
                      {profile.transmission ? ` · ${profile.transmission}` : ""}
                      {profile.enginePattern ? ` · engine contains “${profile.enginePattern}”` : ""}
                    </p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">{profile.summary}</p>
                  </div>
                  <form action={deleteReliabilityProfileAction}>
                    <input name="id" type="hidden" value={profile.id} />
                    <ConfirmDeleteButton
                      className="rounded-lg border border-negative/20 px-3 py-2 text-xs font-semibold text-negative"
                      message={`Delete the ${profile.make} ${profile.model} profile and all its issues and sources?`}
                    >
                      Delete profile
                    </ConfirmDeleteButton>
                  </form>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-ink">Known issues · {profile.issues.length}</p>
                    <ul className="mt-2 grid gap-2">
                      {profile.issues.map((issue) => (
                        <li className="rounded-lg border border-border p-3" key={issue.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-ink">{issue.title}</p>
                              <p className="mt-1 text-[11px] leading-5 text-ink-muted">{issue.description}</p>
                            </div>
                            <form action={deleteReliabilityIssueAction}>
                              <input name="id" type="hidden" value={issue.id} />
                              <ConfirmDeleteButton className={deleteButton} message={`Remove “${issue.title}”?`}>Remove</ConfirmDeleteButton>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3"><AddReliabilityIssueForm profileId={profile.id} /></div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-ink">Evidence · {profile.sources.length}</p>
                    <ul className="mt-2 grid gap-2">
                      {profile.sources.map((source) => (
                        <li className="flex items-start justify-between gap-3 rounded-lg border border-border p-3" key={source.id}>
                          <a className="min-w-0 truncate text-xs font-semibold text-accent-strong hover:underline" href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a>
                          <form action={deleteReliabilitySourceAction}>
                            <input name="id" type="hidden" value={source.id} />
                            <ConfirmDeleteButton className={deleteButton} message={`Remove the source “${source.label}”?`}>Remove</ConfirmDeleteButton>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3"><AddReliabilitySourceForm profileId={profile.id} /></div>
                  </div>
                </div>
              </article>
            ))}
            {profiles.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-ink-muted">No reliability profiles yet.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
