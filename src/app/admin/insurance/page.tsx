import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import {
  listDistinctInsurers,
  listInsuranceProfiles,
  listInsuranceQuotes,
} from "@/infrastructure/database/insurance-repository";
import { deleteProfileAction, deleteQuoteAction } from "./actions";
import { CreateProfileForm } from "./create-profile-form";
import { CreateQuoteForm } from "./create-quote-form";
import { EstimatePreview } from "./estimate-preview";
import { DeleteRowButton } from "./delete-row-button";

export const metadata = { title: "Insurance data · Carnalys Admin" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  dateStyle: "medium",
});
const money = (amount: number) => amount.toLocaleString("sv-SE");

export default async function AdminInsurancePage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/insurance");
  }

  const [profiles, quotes, insurers] = await Promise.all([
    listInsuranceProfiles(),
    listInsuranceQuotes(),
    listDistinctInsurers(),
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
              href="/admin/users"
            >
              Users
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
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
          Private administrator view
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Insurance data</h1>
        <p className="mt-2 max-w-[70ch] text-sm text-ink-muted">
          Manually-collected insurance quotes, one row per vehicle/insurer/profile/date. Nothing here is ever
          overwritten — requoting the same vehicle later adds a new row instead. This is the raw dataset the
          comparable-lookup estimator below reads from; no personnummer or other driver identity is stored,
          only the anonymous profiles below.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Profiles</h2>
          <p className="mt-1 text-sm text-ink-muted">
            The driver side of a quote, held constant across vehicles. Coverage level is recorded per quote, not
            here, since the same profile is often requoted at different coverage levels.
          </p>
          <div className="mt-4">
            <CreateProfileForm />
          </div>
          {profiles.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="bg-surface-subtle text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                  <tr>
                    {["Label", "Age band", "Licence yrs", "Region", "Annual mileage", "Quotes", ""].map((h) => (
                      <th className="px-3 py-2.5 font-semibold" key={h || "actions"}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profiles.map((p) => (
                    <tr className="transition hover:bg-surface-subtle" key={p.id}>
                      <td className="px-3 py-2.5 text-[13px] font-semibold text-ink">{p.label}</td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-muted">{p.ageBand}</td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">{p.licenceYears}</td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-muted">{p.region}</td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">
                        {p.annualMileageKm.toLocaleString("sv-SE")} km
                      </td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">{p.quoteCount}</td>
                      <td className="px-3 py-2.5 text-right">
                        {p.quoteCount === 0 ? (
                          <DeleteRowButton
                            action={deleteProfileAction}
                            confirmMessage={`Delete profile "${p.label}"?`}
                            id={p.id}
                          />
                        ) : (
                          <span className="text-xs text-ink-subtle" title="Remove its quotes first">
                            in use
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-subtle">No profiles yet — add one above before logging a quote.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Add a quote</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Look up a registration number already in the catalog to fill in the vehicle side, or enter it
            manually for a car that isn&apos;t listed.
          </p>
          {profiles.length > 0 ? (
            <div className="mt-4">
              <CreateQuoteForm insurers={insurers} profiles={profiles} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-subtle">Add a profile first.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">
            Quotes <span className="font-normal text-ink-subtle">({quotes.length})</span>
          </h2>
          {quotes.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead className="bg-surface-subtle text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                  <tr>
                    {[
                      "Vehicle",
                      "Reg.nr",
                      "Value",
                      "Insurer",
                      "Coverage",
                      "Premium/mo",
                      "Profile",
                      "Observed",
                      "",
                    ].map((h) => (
                      <th className="px-3 py-2.5 font-semibold" key={h || "actions"}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quotes.map((q) => (
                    <tr className="transition hover:bg-surface-subtle" key={q.id}>
                      <td className="px-3 py-2.5 text-[13px] font-semibold text-ink">
                        {q.modelYear} {q.make} {q.model}
                        {q.variant ? <span className="font-normal text-ink-muted"> {q.variant}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-muted">{q.registrationNumber ?? "—"}</td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">
                        {money(q.vehicleValueAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-ink">{q.insurer}</td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-muted">{q.coverageLevel}</td>
                      <td className="px-3 py-2.5 text-[13px] font-semibold tabular-nums text-ink">
                        {money(q.monthlyPremiumAmount)}
                      </td>
                      <td className="px-3 py-2.5 text-[13px] text-ink-muted">{q.profile.label}</td>
                      <td className="px-3 py-2.5 text-[13px] tabular-nums text-ink-muted">
                        {dateFormat.format(q.observedAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <DeleteRowButton
                          action={deleteQuoteAction}
                          confirmMessage={`Delete this ${q.make} ${q.model} quote from ${q.insurer}?`}
                          id={q.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-subtle">No quotes recorded yet.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Try an estimate</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Runs the comparable-lookup estimator against whatever quotes exist above right now — useful for
            sanity-checking coverage as the dataset grows.
          </p>
          <div className="mt-4">
            <EstimatePreview />
          </div>
        </section>
      </main>
    </div>
  );
}
