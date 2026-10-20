import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { getSourceValueReport } from "@/infrastructure/database/source-value-repository";

export const metadata = { title: "Source value · Carnalys Admin" };
export const dynamic = "force-dynamic";

const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  dateStyle: "medium",
  timeStyle: "short",
});

function PercentBar({ value, tone = "bg-accent" }: { value: number; tone?: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="w-11 text-right text-[11px] tabular-nums text-ink-muted">{value.toFixed(1)}%</span>
    </div>
  );
}

export default async function SourceValuePage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/source-value");
  }
  const report = await getSourceValueReport();
  const names = new Map(report.sources.map((source) => [source.provider, source.displayName]));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-12">
          <Link className="flex items-center gap-2.5" href="/">
            <CarnalysMark className="size-8 text-ink" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-ink">Carnalys Admin</span>
          </Link>
          <nav className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/admin/reliability">Reliability</Link>
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/admin/market-report">Market report</Link>
            <Link className="rounded-lg border border-border px-3 py-2 text-ink" href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-5 pb-24 pt-9 sm:px-8 lg:px-12">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">Private administrator view</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Source contribution</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">
          Measures marginal inventory, overlap, freshness and useful field coverage before another importer is promoted to full synchronization.
        </p>
        <p className="mt-1 text-xs text-ink-subtle">Generated {dateTime.format(report.generatedAt)} · stale means not observed for {report.staleAfterHours} hours</p>

        <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead className="bg-surface-subtle text-[10px] font-bold uppercase tracking-[0.07em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Inventory</th>
                  <th className="px-4 py-3">Unique contribution</th>
                  <th className="px-4 py-3">Overlap with Blocket</th>
                  <th className="px-4 py-3">Lead vs Blocket</th>
                  <th className="px-4 py-3">Field coverage</th>
                  <th className="px-4 py-3">Stale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.sources.map((source) => (
                  <tr className="align-top" key={source.provider}>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-ink">{source.displayName}</p>
                      <p className="mt-1 text-[10px] text-ink-subtle">{source.provider}</p>
                      {source.lastSynchronizedAt ? <p className="mt-1 text-[10px] text-ink-subtle">Sync {dateTime.format(source.lastSynchronizedAt)}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-xs tabular-nums text-ink-muted">
                      <p><span className="font-semibold text-ink">{integer.format(source.activeVehicles)}</span> vehicles</p>
                      <p className="mt-1">{integer.format(source.activeListings)} ads</p>
                    </td>
                    <td className="min-w-48 px-4 py-4">
                      <p className="text-xs text-ink-muted"><span className="font-semibold text-ink">{integer.format(source.uniqueVehicles)}</span> only here</p>
                      <PercentBar tone="bg-positive" value={source.uniqueRate} />
                    </td>
                    <td className="min-w-48 px-4 py-4">
                      {source.blocketOverlapRate === null ? (
                        <p className="text-xs text-ink-subtle">Baseline source</p>
                      ) : (
                        <>
                          <p className="text-xs text-ink-muted">{integer.format(source.blocketOverlapVehicles)} shared vehicles</p>
                          <PercentBar tone="bg-ink-muted" value={source.blocketOverlapRate} />
                        </>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-ink-muted">
                      {source.averageLeadHoursVsBlocket === null
                        ? "–"
                        : source.averageLeadHoursVsBlocket > 0
                          ? `${integer.format(source.averageLeadHoursVsBlocket)} h earlier`
                          : `${integer.format(Math.abs(source.averageLeadHoursVsBlocket))} h later`}
                    </td>
                    <td className="min-w-48 px-4 py-4 text-[11px] text-ink-muted">
                      <p>Registration {source.registrationCoverage.toFixed(1)}%</p>
                      <p>Description {source.descriptionCoverage.toFixed(1)}%</p>
                      <p>Images {source.imageCoverage.toFixed(1)}%</p>
                      <p>Equipment {source.equipmentCoverage.toFixed(1)}%</p>
                    </td>
                    <td className="min-w-40 px-4 py-4">
                      <p className="text-xs text-ink-muted">{integer.format(source.staleVehicles)} vehicles</p>
                      <PercentBar tone={source.staleRate > 10 ? "bg-negative" : "bg-positive"} value={source.staleRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-ink">Pairwise overlap</h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">The percentage uses the smaller source as the denominator: 90% means almost everything in the smaller source also appears in the larger one.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.overlaps.map((overlap) => (
              <article className="rounded-xl border border-border bg-surface p-4" key={`${overlap.sourceA}-${overlap.sourceB}`}>
                <p className="truncate text-sm font-semibold text-ink">{names.get(overlap.sourceA) ?? overlap.sourceA} × {names.get(overlap.sourceB) ?? overlap.sourceB}</p>
                <p className="mt-2 text-xs text-ink-muted">{integer.format(overlap.sharedVehicles)} shared physical vehicles</p>
                <PercentBar tone="bg-ink-muted" value={overlap.overlapOfSmallerSource} />
              </article>
            ))}
          </div>
        </section>

        <aside className="mt-10 rounded-2xl border border-border bg-surface-subtle p-5 text-xs leading-6 text-ink-muted">
          <p className="font-semibold text-ink">How to read this</p>
          <p className="mt-1">A source earns its maintenance cost by adding unique vehicles, discovering shared vehicles earlier, improving important fields, or detecting removals faster. High raw inventory with high overlap is not automatically high value.</p>
          <p className="mt-2">Lead time uses Carnalys first-seen timestamps. Treat it as directional until every compared source has run continuously for the same period.</p>
        </aside>
      </main>
    </div>
  );
}
