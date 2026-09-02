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

export const metadata = { title: "Daily market report · Carnalys Admin" };
export const dynamic = "force-dynamic";

const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
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

function verificationLabel(status: VehicleRegisterRow["verificationStatus"]) {
  if (status === "deactivated_sold") return "Seller marked sold / removed";
  if (status === "purged") return "Ad page gone (404)";
  if (status === "direct_check_missing") return "Direct check: gone";
  if (status === "reconciliation") return "Not re-seen (unconfirmed)";
  return "Unverified";
}

function RankedList({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: DailyMarketReport["topLikelySoldModels"];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length ? (
        <ul className="mt-2.5 divide-y divide-border">
          {rows.map((row) => (
            <li className="flex items-baseline justify-between gap-4 py-2 text-sm" key={row.name}>
              <span className="min-w-0 truncate text-ink-muted">{row.name}</span>
              <span className="shrink-0 tabular-nums text-ink">
                <span className="font-semibold">{integer.format(row.count)}</span>
                {row.averagePrice > 0 ? (
                  <span className="text-ink-subtle"> · {currency.format(row.averagePrice)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2.5 text-sm text-ink-subtle">{emptyLabel}</p>
      )}
    </div>
  );
}

function Extreme({ label, vehicle }: { label: string; vehicle: VehicleRegisterRow | null }) {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      {vehicle ? (
        <>
          <p className="mt-1 text-sm font-semibold text-ink">
            {vehicle.make} {vehicle.model}
            {vehicle.variant ? <span className="font-normal text-ink-muted"> {vehicle.variant}</span> : null}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {currency.format(vehicle.priceAmount)} · {vehicle.modelYear} · {mil(vehicle.mileageKm)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-subtle">No activity</p>
      )}
    </div>
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
  const metrics: Array<[string, string, string]> = [
    ["New listings today", integer.format(report.newListings.count), `${integer.format(report.recentDailyAverageNew)} recent daily average`],
    ["Likely sold / disappeared", integer.format(report.likelySold.count), `${integer.format(report.recentDailyAverageLikelySold)} recent daily average`],
    ["Average final asking price", report.likelySold.count ? currency.format(report.likelySold.averagePrice) : "–", "Final observed asking price, not a sale price"],
    ["Active inventory", integer.format(report.activeListings), report.datasetAgeDays != null ? `Blocket data ${report.datasetAgeDays} days old` : "Across all sources"],
  ];

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
            href="/settings"
          >
            Settings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">
              Private administrator view
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Daily market control</h1>
            <p className="mt-2 text-sm text-ink-muted">
              Swedish used car activity for {report.reportDate} · generated {dateTime.format(report.generatedAt)}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <ResendReportButton />
            <VerifyBlocketButton />
          </div>
        </header>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, detail]) => (
            <article
              className="rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_30px_rgba(26,35,29,0.04)]"
              key={label}
            >
              <p className="text-xs text-ink-subtle">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
              <p className="mt-1 text-xs text-ink-muted">{detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 rounded-xl border border-[#ead59e] bg-[#fff8e5] px-4 py-3 text-sm leading-6 text-[#6f5520]">
          <strong>Confidence notice:</strong> a missing listing is not a confirmed sale. “Likely sold /
          disappeared” means the advert left the marketplace during reconciliation or a direct availability
          check. Every price shown is the <em>final observed asking price</em>, not a verified sale price.
          Figures depend on how completely and recently the listing checks have run — see coverage below.
        </div>

        {report.warnings.length ? (
          <section className="mt-4 rounded-xl border border-[#ead59e] bg-[#fff8e5] px-4 py-3 text-sm leading-6 text-[#6f5520]">
            <p className="font-semibold">Data coverage warnings</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.observations.length ? (
          <section className="mt-4 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm leading-6 text-ink-muted">
            <p className="font-semibold text-ink">Worth investigating</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {report.observations.map((observation) => (
                <li key={observation}>{observation}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          <RankedList
            title="Most popular makes & models among disappeared listings"
            rows={report.topLikelySoldModels}
            emptyLabel="No disappearances recorded for this period."
          />
          <RankedList
            title="Sellers with the most disappeared listings"
            rows={report.topLikelySoldSellers}
            emptyLabel="No disappearances recorded for this period."
          />
          <div className="grid grid-cols-2 gap-6 sm:col-span-2">
            <Extreme label="Cheapest likely sold" vehicle={report.cheapestLikelySold} />
            <Extreme label="Most expensive likely sold" vehicle={report.mostExpensiveLikelySold} />
          </div>
          <RankedList
            title="New listing supply by source (today)"
            rows={report.newListingsByProvider}
            emptyLabel="No new listings recorded for this period."
          />
          <RankedList
            title="Active inventory by source"
            rows={report.activeListingsByProvider}
            emptyLabel="No active inventory."
          />
          <div className="sm:col-span-2">
            <h3 className="text-sm font-semibold text-ink">Price movement today</h3>
            <p className="mt-2 text-sm text-ink-muted">
              {integer.format(report.priceChanges.count)} changes ·{" "}
              {integer.format(report.priceChanges.reductions)} reductions ·{" "}
              {integer.format(report.priceChanges.increases)} increases · average{" "}
              {currency.format(report.priceChanges.averageChange)}
            </p>
          </div>
        </section>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-ink">Import &amp; verification health</h2>
          <div className="mt-3 grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2">
            <div className="space-y-1.5 text-ink-muted">
              <p>
                Direct availability coverage:{" "}
                <span className="font-semibold text-ink">{vh.coveragePercent}%</span> of{" "}
                {integer.format(vh.activeTotal)} active Blocket listings ·{" "}
                {integer.format(vh.neverChecked)} never checked
              </p>
              <p>
                Last sample outcome: {integer.format(vh.lastMissing)} missing ·{" "}
                {integer.format(vh.lastActive)} active · {integer.format(vh.lastInconclusive)} inconclusive
              </p>
              <p>
                Last direct check:{" "}
                {vh.newestCheckAt ? dateTime.format(vh.newestCheckAt) : "never"} · oldest still-standing check:{" "}
                {vh.oldestCheckAt ? dateTime.format(vh.oldestCheckAt) : "never"}
              </p>
              <p>
                Last full reconciliation sweep:{" "}
                {report.lastReconciliationCleanupAt
                  ? dateTime.format(report.lastReconciliationCleanupAt)
                  : "none on record"}
              </p>
              <p>
                Today&apos;s disappearances by method:{" "}
                {integer.format(report.disappearanceMethod.directCheck)} direct check (of which{" "}
                {integer.format(report.disappearanceMethod.deactivatedSold)} the seller marked sold/removed) ·{" "}
                {integer.format(report.disappearanceMethod.reconciliation)} not re-seen
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] border-collapse text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                  <tr>
                    {["Source", "Runs", "New", "Updated", "Removed", "Failed"].map((h) => (
                      <th className="py-1.5 pr-4 font-semibold" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-ink-muted">
                  {report.importHealth.length ? (
                    report.importHealth.map((row) => (
                      <tr key={row.provider}>
                        <td className="py-1.5 pr-4 capitalize text-ink">{row.provider}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{integer.format(row.runs)}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{integer.format(row.createdCount)}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{integer.format(row.updatedCount)}</td>
                        <td className="py-1.5 pr-4 tabular-nums">{integer.format(row.removedCount)}</td>
                        <td
                          className={`py-1.5 pr-4 tabular-nums ${
                            row.failedRuns ? "font-semibold text-negative" : ""
                          }`}
                        >
                          {integer.format(row.failedRuns)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-1.5 text-ink-subtle" colSpan={6}>
                        No import runs recorded for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-ink">Likely sold / disappeared vehicle register</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {integer.format(report.likelySoldVehicles.length)} detailed record
                {report.likelySoldVehicles.length === 1 ? "" : "s"} for {report.reportDate}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] border-collapse text-left">
              <thead className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                <tr>
                  {[
                    "Car",
                    "Drivetrain",
                    "Transmission",
                    "Power",
                    "Year",
                    "Mileage",
                    "Final asking price",
                    "Seller",
                    "Source",
                    "Advertised",
                    "Gone at",
                    "Verification",
                  ].map((heading) => (
                    <th className="px-4 py-3 font-semibold" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.likelySoldVehicles.length ? (
                  report.likelySoldVehicles.map((vehicle) => (
                    <tr className="transition hover:bg-surface-subtle" key={vehicle.listingId}>
                      <td className="px-4 py-3">
                        <Link
                          className="block text-sm font-semibold text-ink underline-offset-2 hover:underline"
                          href={`/vehicle/${vehicle.vehicleId}`}
                        >
                          {vehicle.make} {vehicle.model}
                        </Link>
                        {vehicle.variant ? (
                          <span className="mt-0.5 block max-w-[260px] truncate text-xs text-ink-subtle">
                            {vehicle.variant}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.drivetrain || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.transmission}</td>
                      <td className="px-4 py-3 text-sm text-ink-muted">
                        {vehicle.horsepower ? `${vehicle.horsepower} hp` : "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.modelYear}</td>
                      <td className="px-4 py-3 text-sm text-ink-muted">{mil(vehicle.mileageKm)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-ink">
                        {currency.format(vehicle.priceAmount)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-sm text-ink-muted">
                        {vehicle.sellerName || "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-sm capitalize text-ink-muted">{vehicle.provider}</td>
                      <td className="px-4 py-3 text-sm text-ink-muted">
                        {vehicle.daysAdvertised != null ? `${integer.format(vehicle.daysAdvertised)} d` : "–"}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-muted">
                        {clock.format(vehicle.disappearedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {verificationLabel(vehicle.verificationStatus)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-ink-subtle" colSpan={12}>
                      No listings were classified as likely sold or disappeared for {report.reportDate}. If
                      the availability sample and reconciliation have run, this is a real zero — check the
                      coverage warnings and verification health above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
