import { redirect } from "next/navigation";
import Link from "next/link";
import {
  buildDailyMarketReport,
  type DailyMarketReport,
  type VehicleRegisterRow,
} from "@/application/reporting/daily-market-report";
import { requireAdmin } from "@/features/auth/session";
import { CarnalysMark } from "@/features/search/carnalys-mark";
import { ResendReportButton } from "./resend-report-button";
import { VerifyBlocketButton } from "./verify-blocket-button";
import { CoverageBar, DayBars, DivergingHistogram, RankedBars, Sparkline } from "./charts";

export const metadata = { title: "Daily market report · Carnalys Admin" };
export const dynamic = "force-dynamic";

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "SEK",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  dateStyle: "medium",
  timeStyle: "short",
});
const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  hour: "2-digit",
  minute: "2-digit",
});

function mil(mileageKm: number) {
  return `${integer.format(Math.round(mileageKm / 10))} mil`;
}

function signedPercent(current: number, baseline: number) {
  if (!baseline) return null;
  const pct = Math.round(((current - baseline) / baseline) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs 7-day avg`;
}

function verificationLabel(status: VehicleRegisterRow["verificationStatus"]) {
  if (status === "deactivated_sold") return "Seller marked sold";
  if (status === "purged") return "Ad page gone";
  if (status === "direct_check_missing") return "Direct check: gone";
  if (status === "reconciliation") return "Not re-seen";
  return "Unverified";
}

/** A compact vehicle reference — the "which cars" answer, not a table row. */
function CarChip({ label, vehicle }: { label: string; vehicle: VehicleRegisterRow | null }) {
  if (!vehicle) {
    return (
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</p>
        <p className="mt-1 text-sm text-ink-subtle">No activity</p>
      </div>
    );
  }
  return (
    <Link className="group min-w-0" href={`/vehicle/${vehicle.vehicleId}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink group-hover:underline">
        {vehicle.make} {vehicle.model}
      </p>
      <p className="mt-0.5 text-[13px] tabular-nums text-ink-muted">
        {currency.format(vehicle.priceAmount)} · {vehicle.modelYear} · {mil(vehicle.mileageKm)}
      </p>
    </Link>
  );
}

function Stat({
  label,
  value,
  meta,
  chart,
}: {
  label: string;
  value: string;
  meta?: string | null;
  chart?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</p>
      <p className="mt-1.5 text-[1.55rem] font-semibold leading-none tracking-[-0.035em] tabular-nums text-ink">
        {value}
      </p>
      {chart}
      {meta ? <p className="mt-1.5 text-[10px] tabular-nums text-ink-subtle">{meta}</p> : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-[#ead59e] bg-[#fff8e5] px-3 py-2 text-[13px] leading-5 text-[#6f5520]">
      {children}
    </p>
  );
}

export default async function AdminMarketReportPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/market-report");
  }

  const reportResult = await buildDailyMarketReport(new Date(), 0)
    .then((report) => ({ report, error: null }))
    .catch((error: unknown) => ({
      report: null,
      error: error instanceof Error ? error.message : "Unknown report error",
    }));

  if (!reportResult.report) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-5">
        <section className="w-full max-w-2xl rounded-[1.5rem] border border-border bg-surface p-7 shadow-[0_12px_40px_rgba(26,35,29,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-negative">
            Administrator report diagnostic
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">The market report query failed</h1>
          <p className="mt-4 rounded-xl bg-surface-subtle p-4 font-mono text-sm leading-6 text-ink-muted">
            {reportResult.error}
          </p>
          <Link
            className="mt-5 inline-flex rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink"
            href="/settings"
          >
            Return to settings
          </Link>
        </section>
      </main>
    );
  }

  const report = reportResult.report;
  const vh = report.verificationHealth;
  const backlog = report.backlog;

  // The window's disappearances, framed for the current data maturity.
  const removalHeadline = backlog.active ? "Removals detected" : "Likely sold / disappeared";
  const removalTrend = backlog.active
    ? "first full availability sweep — a backlog clearing, not one day's turnover"
    : signedPercent(report.likelySold.count, report.recentDailyAverageLikelySold);

  const newestGone = [...report.likelySoldVehicles].sort((a, b) => b.modelYear - a.modelYear)[0] ?? null;

  const method = report.disappearanceMethod;
  const methodRows = [
    { name: "Seller marked sold / removed", count: method.deactivatedSold },
    { name: "Direct check: gone (kind unknown)", count: Math.max(0, method.directCheck - method.deactivatedSold) },
    { name: "Not re-seen by an import", count: method.reconciliation },
  ].filter((row) => row.count > 0);

  const priceMoves = report.priceChanges;

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
              href="/admin/users"
            >
              Users
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
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Daily market control</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Swedish used-car activity · {report.reportDate} · generated {dateTime.format(report.generatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ResendReportButton />
            <VerifyBlocketButton />
          </div>
        </div>

        {/* 1 — Removals: the answer to "what left the market, and which cars". */}
        <section className="mt-10 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              {removalHeadline} · {report.reportDate}
            </p>
            <p className="mt-2 text-[3rem] font-semibold leading-none tracking-[-0.045em] tabular-nums text-ink">
              {integer.format(report.likelySold.count)}
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-5 text-ink-muted">{removalTrend}</p>
            <p className="mt-1 text-[13px] tabular-nums text-ink-subtle">
              {integer.format(report.removedToDate.blocket)} removed to date ·{" "}
              {report.likelySold.count ? currency.format(report.likelySold.averagePrice) : "–"} avg final asking
            </p>
            <p className="mt-3 max-w-md text-[12px] italic leading-5 text-ink-subtle">
              A missing ad is not a confirmed sale; every price shown is the last observed asking price.
            </p>
            {backlog.active ? (
              <div className="mt-3 max-w-md">
                <Note>
                  Only {vh.coveragePercent}% of active Blocket inventory has ever been directly checked, so this
                  figure is a two-week backlog being cleared over the first sweeps — not a daily rate. It settles
                  in ≈ {backlog.daysToFullCoverage} nights.
                </Note>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-6 self-start sm:grid-cols-3">
            <CarChip label="Cheapest gone" vehicle={report.cheapestLikelySold} />
            <CarChip label="Priciest gone" vehicle={report.mostExpensiveLikelySold} />
            <CarChip label="Newest gone" vehicle={newestGone} />
          </div>
        </section>

        {/* 2 — Removal shape over time and by cause. */}
        <section className="mt-12 border-t border-border pt-8">
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold text-ink">Removals detected · last 21 days</h2>
              <DayBars series={report.removalsByDay} />
              <p className="mt-1.5 text-[10px] tabular-nums text-ink-subtle">
                newest day accented · outlier days clipped
              </p>
              {methodRows.length ? (
                <dl className="mt-5 space-y-1.5">
                  {methodRows.map((row) => (
                    <div className="flex items-baseline justify-between gap-3 text-[13px]" key={row.name}>
                      <dt className="text-ink-muted">{row.name}</dt>
                      <dd className="shrink-0 font-semibold tabular-nums text-ink">{integer.format(row.count)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold text-ink">Top makes &amp; models</h2>
                <RankedBars rows={report.topLikelySoldModels.slice(0, 6)} total={report.likelySold.count} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink">Top sellers</h2>
                <RankedBars rows={report.topLikelySoldSellers.slice(0, 6)} total={report.likelySold.count} />
              </div>
            </div>
          </div>
        </section>

        {/* 3 — Market context. */}
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-semibold text-ink">Market context</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-10 gap-y-7 sm:grid-cols-4">
            <Stat
              label="New listings today"
              value={integer.format(report.newListings.count)}
              meta={signedPercent(report.newListings.count, report.recentDailyAverageNew)}
              chart={<Sparkline series={report.newListingsByDay} />}
            />
            <Stat
              label="Active inventory"
              value={integer.format(report.activeListings)}
              meta={report.datasetAgeDays != null ? `Blocket data ${report.datasetAgeDays} d old` : "All sources"}
            />
            <Stat
              label="Price moves today"
              value={integer.format(priceMoves.count)}
              meta={`${integer.format(priceMoves.reductions)} cuts · ${integer.format(priceMoves.increases)} rises`}
              chart={<DivergingHistogram buckets={report.priceChangeHistogram} />}
            />
            <Stat
              label="Avg listing price"
              value={report.newListings.averagePrice ? currency.format(report.newListings.averagePrice) : "–"}
              meta="New listings, plausible asking prices only"
            />
          </div>
        </section>

        {/* 4 — Data trust (replaces the prose). */}
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-sm font-semibold text-ink">Data trust</h2>
          <div className="mt-4 grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CoverageBar
              percent={vh.coveragePercent}
              checked={vh.activeTotal - vh.neverChecked}
              total={vh.activeTotal}
              daysToFull={backlog.daysToFullCoverage}
            />
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Last sweep outcome</dt>
                <dd className="tabular-nums text-ink">
                  {integer.format(vh.lastMissing)} gone · {integer.format(vh.lastActive)} live ·{" "}
                  {integer.format(vh.lastInconclusive)} unclear
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Last direct check</dt>
                <dd className="tabular-nums text-ink">
                  {vh.newestCheckAt ? dateTime.format(vh.newestCheckAt) : "never"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Last reconciliation sweep</dt>
                <dd className="tabular-nums text-ink">
                  {report.lastReconciliationCleanupAt
                    ? dateTime.format(report.lastReconciliationCleanupAt)
                    : "none on record"}
                </dd>
              </div>
            </dl>
          </div>
          {vh.lastInconclusive > 20 && vh.lastInconclusive >= vh.lastMissing ? (
            <div className="mt-4 max-w-xl">
              <Note>
                The last availability sweep returned {integer.format(vh.lastInconclusive)} inconclusive results —
                the checker service may be rate-limiting or degraded.
              </Note>
            </div>
          ) : null}
        </section>

        {/* 5 — The register, collapsed. */}
        <section className="mt-12 border-t border-border pt-8">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
              <span className="text-ink-subtle transition group-open:rotate-90">▸</span>
              Detected disappearances · {integer.format(report.likelySold.count)} vehicles
              <span className="font-normal text-ink-subtle">— show register</span>
            </summary>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead className="bg-surface-subtle text-[10px] uppercase tracking-[0.08em] text-ink-subtle">
                  <tr>
                    {["Car", "Year", "Mileage", "Final price", "Seller", "Gone", "Verification"].map((h) => (
                      <th className="px-3 py-2.5 font-semibold" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.likelySoldVehicles.length ? (
                    report.likelySoldVehicles.map((vehicle) => (
                      <tr className="transition hover:bg-surface-subtle" key={vehicle.listingId}>
                        <td className="px-3 py-2">
                          <Link
                            className="text-[13px] font-semibold text-ink underline-offset-2 hover:underline"
                            href={`/vehicle/${vehicle.vehicleId}`}
                          >
                            {vehicle.make} {vehicle.model}
                          </Link>
                          {vehicle.variant ? (
                            <span className="mt-0.5 block max-w-[240px] truncate text-[11px] text-ink-subtle">
                              {vehicle.variant}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-[13px] tabular-nums text-ink-muted">{vehicle.modelYear}</td>
                        <td className="px-3 py-2 text-[13px] tabular-nums text-ink-muted">{mil(vehicle.mileageKm)}</td>
                        <td className="px-3 py-2 text-[13px] font-semibold tabular-nums text-ink">
                          {currency.format(vehicle.priceAmount)}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-[13px] text-ink-muted">
                          {vehicle.sellerName || "Unknown"}
                        </td>
                        <td className="px-3 py-2 text-[13px] tabular-nums text-ink-muted">
                          {clock.format(vehicle.disappearedAt)}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-ink-muted">
                          {verificationLabel(vehicle.verificationStatus)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-3 py-8 text-center text-sm text-ink-subtle" colSpan={7}>
                        No listings were classified as likely sold or disappeared for {report.reportDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
