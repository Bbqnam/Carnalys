import { redirect } from "next/navigation";
import { buildDailyMarketReport } from "@/application/reporting/daily-market-report";
import { requireAdmin } from "@/features/auth/session";
import { SiteHeader } from "@/features/search/site-header";
import { ResendReportButton } from "./resend-report-button";

export const metadata = { title: "Daily market report · Carnalys Admin" };
export const dynamic = "force-dynamic";

const integer = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 });

export default async function AdminMarketReportPage() {
  try {
    await requireAdmin();
  } catch {
    redirect("/login?redirectTo=/admin/market-report");
  }
  const report = await buildDailyMarketReport();
  const metrics = [
    ["New listings", integer.format(report.newListings.count), `${report.recentDailyAverageNew} recent daily average`],
    ["Likely sold", integer.format(report.likelySold.count), `${report.recentDailyAverageLikelySold} recent daily average`],
    ["Average last price", currency.format(report.likelySold.averagePrice), "Not a confirmed transaction price"],
    ["Active inventory", integer.format(report.activeListings), "Across all sources"],
  ];

  return (
    <div>
      <SiteHeader compareCount={0} locale="en" savedCount={0} />
      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-accent-strong">Private administrator view</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-ink">Daily market control</h1>
            <p className="mt-2 text-sm text-ink-muted">Swedish used car activity for {report.reportDate}</p>
          </div>
          <ResendReportButton />
        </header>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, detail]) => (
            <article className="rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_30px_rgba(26,35,29,0.04)]" key={label}>
              <p className="text-xs text-ink-subtle">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
              <p className="mt-1 text-xs text-ink-muted">{detail}</p>
            </article>
          ))}
        </section>

        <div className="mt-5 rounded-xl border border-[#ead59e] bg-[#fff8e5] px-4 py-3 text-sm leading-6 text-[#6f5520]">
          <strong>Confidence notice:</strong> “Likely sold” means a listing disappeared during reconciliation. Prices are final observed asking prices. They are not verified sales or transaction prices.
        </div>

        <section className="mt-6 overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-[0_12px_40px_rgba(26,35,29,0.045)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold text-ink">Likely sold vehicle register</h2>
              <p className="mt-1 text-sm text-ink-muted">{integer.format(report.likelySoldVehicles.length)} detailed records shown</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left">
              <thead className="bg-surface-subtle text-[11px] uppercase tracking-[0.08em] text-ink-subtle">
                <tr>{["Car", "Drivetrain", "Transmission", "Power", "Year", "Mileage", "Last asking price", "Seller", "Source", "Gone at"].map((heading) => <th className="px-4 py-3 font-semibold" key={heading}>{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.likelySoldVehicles.map((vehicle) => (
                  <tr className="transition hover:bg-surface-subtle" key={vehicle.listingId}>
                    <td className="px-4 py-3"><span className="block text-sm font-semibold text-ink">{vehicle.make} {vehicle.model}</span>{vehicle.variant ? <span className="mt-0.5 block max-w-[260px] truncate text-xs text-ink-subtle">{vehicle.variant}</span> : null}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.drivetrain || "Unknown"}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.transmission}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.horsepower ? `${vehicle.horsepower} hp` : "Unknown"}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{vehicle.modelYear}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{integer.format(Math.round(vehicle.mileageKm / 10))} mil</td>
                    <td className="px-4 py-3 text-sm font-semibold text-ink">{currency.format(vehicle.priceAmount)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-ink-muted">{vehicle.sellerName || "Unknown"}</td>
                    <td className="px-4 py-3 text-sm capitalize text-ink-muted">{vehicle.provider}</td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(vehicle.disappearedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
