import type {
  DailyMarketReport,
  VehicleRegisterRow,
  VerificationStatus,
} from "./daily-market-report";

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatChange(current: number, baseline: number) {
  if (!baseline) return "No recent baseline";
  const percentage = Math.round(((current - baseline) / baseline) * 100);
  return `${percentage >= 0 ? "+" : ""}${percentage}% vs 7 day average`;
}

function verificationLabel(status: VerificationStatus) {
  if (status === "direct_check_missing") return "Direct check: missing";
  if (status === "reconciliation") return "Left during reconciliation";
  return "Unverified";
}

function vehicleName(vehicle: VehicleRegisterRow | null) {
  return vehicle
    ? `${vehicle.make} ${vehicle.model}${vehicle.variant ? ` ${vehicle.variant}` : ""}`
    : "No vehicle";
}

function metric(label: string, value: string, detail: string) {
  return `<td style="width:25%;padding:8px;vertical-align:top"><div style="background:#fff;border:1px solid #e3e8e4;border-radius:16px;padding:18px;min-height:92px"><div style="font-size:12px;color:#6b756e">${escapeHtml(label)}</div><div style="font-size:25px;font-weight:700;color:#17211a;margin-top:6px">${escapeHtml(value)}</div><div style="font-size:11px;color:#879089;margin-top:5px">${escapeHtml(detail)}</div></div></td>`;
}

function noteList(title: string, items: string[], tone: "warn" | "info") {
  if (!items.length) return "";
  const palette =
    tone === "warn"
      ? { bg: "#fff8e8", border: "#efd69b", color: "#6f5520" }
      : { bg: "#f1f5f2", border: "#dbe4dd", color: "#3d4a42" };
  return `<div style="background:${palette.bg};border:1px solid ${palette.border};border-radius:14px;padding:14px 16px;margin-top:12px;font-size:12px;line-height:1.55;color:${palette.color}"><strong>${escapeHtml(title)}</strong><ul style="margin:6px 0 0;padding-left:18px">${items
    .map((item) => `<li style="margin-top:3px">${escapeHtml(item)}</li>`)
    .join("")}</ul></div>`;
}

function rankedTable(title: string, rows: DailyMarketReport["topLikelySoldModels"]) {
  return `<div style="background:#fff;border:1px solid #e3e8e4;border-radius:18px;padding:20px;margin-top:14px"><h2 style="font-size:17px;margin:0 0 12px;color:#17211a">${escapeHtml(title)}</h2><table role="presentation" style="width:100%;border-collapse:collapse">${rows.length ? rows.map((row, index) => `<tr><td style="padding:9px 0;border-top:${index ? "1px solid #edf0ed" : "0"};font-size:13px;color:#263129">${escapeHtml(row.name)}</td><td style="padding:9px 0;text-align:right;border-top:${index ? "1px solid #edf0ed" : "0"};font-size:13px;font-weight:700;color:#17211a">${integer.format(row.count)}</td><td style="padding:9px 0 9px 18px;text-align:right;border-top:${index ? "1px solid #edf0ed" : "0"};font-size:12px;color:#6b756e">${row.averagePrice > 0 ? currency.format(row.averagePrice) : "–"}</td></tr>`).join("") : `<tr><td style="font-size:13px;color:#6b756e">No activity recorded</td></tr>`}</table></div>`;
}

function vehicleRows(vehicles: VehicleRegisterRow[], appUrl: string | null, maximum = 75) {
  return vehicles
    .slice(0, maximum)
    .map((vehicle, index) => {
      const name = `${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}`;
      const nameCell =
        appUrl && vehicle.vehicleId
          ? `<a href="${escapeHtml(`${appUrl}/vehicle/${vehicle.vehicleId}`)}" style="color:#17211a;text-decoration:none;font-weight:700">${name}</a>`
          : `<strong>${name}</strong>`;
      return `<tr style="background:${index % 2 ? "#fafbf9" : "#fff"}">
    <td style="padding:10px 8px;font-size:12px;color:#17211a">${nameCell}${vehicle.variant ? `<br><span style="color:#79827b">${escapeHtml(vehicle.variant)}</span>` : ""}</td>
    <td style="padding:10px 8px;font-size:12px;color:#445048">${escapeHtml(vehicle.drivetrain || "Unknown")}</td>
    <td style="padding:10px 8px;font-size:12px;color:#445048">${escapeHtml(vehicle.transmission)}</td>
    <td style="padding:10px 8px;font-size:12px;color:#445048;text-align:right">${vehicle.horsepower ? `${integer.format(vehicle.horsepower)} hp` : "Unknown"}</td>
    <td style="padding:10px 8px;font-size:12px;color:#445048;text-align:right">${vehicle.modelYear}</td>
    <td style="padding:10px 8px;font-size:12px;color:#445048;text-align:right">${integer.format(Math.round(vehicle.mileageKm / 10))} mil</td>
    <td style="padding:10px 8px;font-size:12px;color:#17211a;text-align:right;font-weight:700">${currency.format(vehicle.priceAmount)}</td>
    <td style="padding:10px 8px;font-size:11px;color:#6b756e">${escapeHtml(vehicle.provider)}<br>${escapeHtml(vehicle.sellerName || "Unknown seller")}</td>
    <td style="padding:10px 8px;font-size:11px;color:#6b756e;text-align:right">${vehicle.daysAdvertised != null ? `${integer.format(vehicle.daysAdvertised)} d` : "–"}</td>
    <td style="padding:10px 8px;font-size:11px;color:#6b756e;white-space:nowrap">${new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(vehicle.disappearedAt)}</td>
    <td style="padding:10px 8px;font-size:11px;color:#6b756e">${escapeHtml(verificationLabel(vehicle.verificationStatus))}</td>
  </tr>`;
    })
    .join("");
}

export function renderDailyMarketEmail(report: DailyMarketReport) {
  const cheapest = report.cheapestLikelySold;
  const expensive = report.mostExpensiveLikelySold;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
    : null;
  const adminUrl = appUrl ? `${appUrl}/admin/market-report` : null;
  const vh = report.verificationHealth;

  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f2;font-family:Inter,Arial,sans-serif;color:#17211a"><div style="display:none;max-height:0;overflow:hidden">${integer.format(report.newListings.count)} new listings and ${integer.format(report.likelySold.count)} likely sold on ${escapeHtml(report.reportDate)}.</div><div style="max-width:940px;margin:0 auto;padding:28px 14px 44px">
    <div style="background:#183d2d;border-radius:22px;padding:28px;color:#fff"><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#a9d7bd">Carnalys Market Control</div><h1 style="font-size:30px;line-height:1.15;margin:9px 0 5px">Daily used car report</h1><div style="font-size:14px;color:#cfe2d6">Sweden · ${escapeHtml(report.reportDate)}</div></div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px"><tr>
      ${metric("New listings", integer.format(report.newListings.count), formatChange(report.newListings.count, report.recentDailyAverageNew))}
      ${metric("Likely sold", integer.format(report.likelySold.count), formatChange(report.likelySold.count, report.recentDailyAverageLikelySold))}
      ${metric("Avg final asking price", report.likelySold.count ? currency.format(report.likelySold.averagePrice) : "–", "Not a confirmed sale price")}
      ${metric("Active inventory", integer.format(report.activeListings), "All monitored sources")}
    </tr></table>
    <div style="background:#fff8e8;border:1px solid #efd69b;border-radius:14px;padding:14px 16px;margin-top:12px;font-size:12px;line-height:1.5;color:#6f5520"><strong>Confidence notice:</strong> a missing listing is not a confirmed sale. “Likely sold / disappeared” means the advert left the marketplace during reconciliation or a direct availability check. Carnalys has no confirmed transaction or ownership-transfer data. Every price shown is the final observed asking price, not a verified sale price, and every figure depends on how completely and recently the listing checks have run.</div>
    ${noteList("Data coverage warnings", report.warnings, "warn")}
    ${noteList("Worth investigating", report.observations, "info")}
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px"><tr><td style="width:50%;padding:8px 7px 8px 0;vertical-align:top">${rankedTable("Most popular disappeared makes & models", report.topLikelySoldModels)}</td><td style="width:50%;padding:8px 0 8px 7px;vertical-align:top">${rankedTable("Sellers with most disappeared listings", report.topLikelySoldSellers)}</td></tr></table>
    <div style="background:#fff;border:1px solid #e3e8e4;border-radius:18px;padding:20px;margin-top:14px"><h2 style="font-size:17px;margin:0 0 12px">Market extremes</h2><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="width:50%;padding:8px 12px 8px 0"><div style="font-size:11px;color:#6b756e">Cheapest likely sold</div><div style="font-size:14px;font-weight:700;margin-top:4px">${escapeHtml(vehicleName(cheapest))}</div><div style="font-size:13px;color:#445048;margin-top:3px">${cheapest ? `${currency.format(cheapest.priceAmount)} · ${cheapest.modelYear} · ${integer.format(Math.round(cheapest.mileageKm / 10))} mil` : "No activity"}</div></td><td style="width:50%;padding:8px 0 8px 12px;border-left:1px solid #edf0ed"><div style="font-size:11px;color:#6b756e">Most expensive likely sold</div><div style="font-size:14px;font-weight:700;margin-top:4px">${escapeHtml(vehicleName(expensive))}</div><div style="font-size:13px;color:#445048;margin-top:3px">${expensive ? `${currency.format(expensive.priceAmount)} · ${expensive.modelYear} · ${integer.format(Math.round(expensive.mileageKm / 10))} mil` : "No activity"}</div></td></tr></table></div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:6px"><tr><td style="width:50%;padding:8px 7px 8px 0;vertical-align:top">${rankedTable("New listings by source", report.newListingsByProvider)}</td><td style="width:50%;padding:8px 0 8px 7px;vertical-align:top">${rankedTable("Active inventory by source", report.activeListingsByProvider)}</td></tr></table>
    <div style="background:#fff;border:1px solid #e3e8e4;border-radius:18px;padding:20px;margin-top:14px"><h2 style="font-size:17px;margin:0 0 5px">Price movement</h2><p style="font-size:13px;color:#59635c;margin:0">${integer.format(report.priceChanges.count)} price changes · ${integer.format(report.priceChanges.reductions)} reductions · ${integer.format(report.priceChanges.increases)} increases · ${currency.format(report.priceChanges.averageChange)} average change</p></div>
    <div style="background:#fff;border:1px solid #e3e8e4;border-radius:18px;padding:20px;margin-top:14px"><h2 style="font-size:17px;margin:0 0 8px">Import &amp; verification health</h2><p style="font-size:13px;color:#59635c;margin:0 0 4px">Direct availability coverage: <strong>${vh.coveragePercent}%</strong> of ${integer.format(vh.activeTotal)} active Blocket listings · ${integer.format(vh.neverChecked)} never checked.</p><p style="font-size:13px;color:#59635c;margin:0 0 4px">Last sample: ${integer.format(vh.lastMissing)} missing · ${integer.format(vh.lastActive)} active · ${integer.format(vh.lastInconclusive)} inconclusive. Last direct check ${vh.newestCheckAt ? escapeHtml(dateTime.format(vh.newestCheckAt)) : "never"}.</p><p style="font-size:13px;color:#59635c;margin:0">Last full reconciliation sweep: ${report.lastReconciliationCleanupAt ? escapeHtml(dateTime.format(report.lastReconciliationCleanupAt)) : "none on record"} · today by method: ${integer.format(report.disappearanceMethod.directCheck)} direct / ${integer.format(report.disappearanceMethod.reconciliation)} reconciliation.</p></div>
    <div style="background:#fff;border:1px solid #e3e8e4;border-radius:18px;padding:20px;margin-top:14px;overflow-x:auto"><h2 style="font-size:17px;margin:0">Likely sold / disappeared vehicle register</h2><p style="font-size:12px;color:#6b756e;margin:5px 0 14px">Showing ${integer.format(Math.min(report.likelySoldVehicles.length, 75))} of ${integer.format(report.likelySold.count)} detected disappearances.</p><table style="width:100%;border-collapse:collapse;min-width:920px"><thead><tr style="background:#edf3ee"><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Car</th><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Drive</th><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Gearbox</th><th style="padding:9px 8px;text-align:right;font-size:10px;text-transform:uppercase">Power</th><th style="padding:9px 8px;text-align:right;font-size:10px;text-transform:uppercase">Year</th><th style="padding:9px 8px;text-align:right;font-size:10px;text-transform:uppercase">Mileage</th><th style="padding:9px 8px;text-align:right;font-size:10px;text-transform:uppercase">Last price</th><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Source / seller</th><th style="padding:9px 8px;text-align:right;font-size:10px;text-transform:uppercase">Advertised</th><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Gone</th><th style="padding:9px 8px;text-align:left;font-size:10px;text-transform:uppercase">Verification</th></tr></thead><tbody>${vehicleRows(report.likelySoldVehicles, appUrl)}</tbody></table></div>
    ${adminUrl ? `<div style="text-align:center;margin-top:22px"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#183d2d;color:#fff;text-decoration:none;border-radius:12px;padding:13px 20px;font-size:13px;font-weight:700">Open private report</a></div>` : ""}
    <div style="font-size:11px;line-height:1.5;color:#7c857e;text-align:center;margin-top:24px">Generated by Carnalys at ${escapeHtml(dateTime.format(report.generatedAt))}</div>
  </div></body></html>`;

  const text = [
    `Carnalys daily used car report · ${report.reportDate}`,
    `${report.newListings.count} new listings`,
    `${report.likelySold.count} likely sold / disappeared`,
    `${report.likelySold.count ? currency.format(report.likelySold.averagePrice) : "–"} average final observed asking price`,
    `${report.activeListings} active listings`,
    "A missing listing is not a confirmed sale. Prices are final observed asking prices, not verified sale prices.",
    ...report.warnings.map((warning) => `! ${warning}`),
    adminUrl ? `Full private report: ${adminUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}

export async function sendDailyMarketEmail(report: DailyMarketReport) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DAILY_REPORT_FROM;
  const to = process.env.DAILY_REPORT_TO;
  if (!apiKey || !from || !to) {
    throw new Error(
      "Email delivery is not configured. Set RESEND_API_KEY, DAILY_REPORT_FROM and DAILY_REPORT_TO to enable it.",
    );
  }
  const rendered = renderDailyMarketEmail(report);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((address) => address.trim()).filter(Boolean),
      subject: `Carnalys daily market report · ${report.reportDate}`,
      html: rendered.html,
      text: rendered.text,
    }),
  });
  const result = (await response.json()) as { id?: string; message?: string };
  if (!response.ok) throw new Error(result.message || `Resend returned ${response.status}.`);
  return result;
}
