"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getComparedListings } from "@/app/actions";
import { estimateFuelConsumptionL100km } from "@/domain/vehicle";
import { BrandLogo } from "@/features/search/brand-logo";
import { uiCopy, type Locale } from "@/features/search/copy";
import { createMoneyFormatter, createNumberFormatter } from "@/features/search/format";
import { ArrowRightIcon, CloseIcon, ExternalLinkIcon } from "@/features/search/icons";
import { useLocaleCookie } from "@/features/search/use-locale-cookie";
import { SiteHeader } from "@/features/search/site-header";
import { SiteFooter } from "@/features/search/site-footer";
import { useCompare } from "@/features/search/use-compare";
import { useFavorites } from "@/features/search/use-favorites";
import type { VehicleSearchResult } from "@/features/search/types";
import { useAnalystPageContext } from "@/features/analyst/analyst-chat-provider";

export default function ComparePage() {
  const router = useRouter();
  const { compared, remove, clear } = useCompare();
  const { favorites } = useFavorites();
  useAnalystPageContext(
    compared.length >= 2 && compared.length <= 3
      ? { surface: "comparison", listingIds: compared.map((vehicle) => vehicle.id) }
      : null,
  );
  const [locale, writeLocale] = useLocaleCookie();
  const [fetchedResults, setResults] = useState<VehicleSearchResult[] | null>(null);
  const copy = uiCopy[locale];
  const moneyFormatter = createMoneyFormatter(locale);
  const numberFormatter = createNumberFormatter(locale);

  useEffect(() => {
    if (compared.length === 0) return;
    let cancelled = false;
    getComparedListings(compared.map((vehicle) => vehicle.id)).then((data) => {
      if (!cancelled) setResults(data);
    });
    return () => {
      cancelled = true;
    };
  }, [compared]);

  const results = compared.length === 0 ? [] : fetchedResults;

  function changeLocale(nextLocale: Locale) {
    writeLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }

  function fuelConsumptionValue(result: VehicleSearchResult) {
    // Electric cars report energy use in kWh/100km, not L/100km — not
    // comparable to the other rows' numbers, so they're excluded from the
    // "best value" highlight for this row (the raw figure still renders in
    // the cell, just without a possibly-misleading cross-unit comparison).
    if (result.vehicle.specification.powertrain.fuelType === "electric") {
      return undefined;
    }
    const real = result.vehicle.specification.powertrain.fuelConsumption;
    const source = real ?? undefined;
    const parsed = Number.parseFloat(
      (source ?? "").replace(",", ".").match(/[\d.]+/)?.[0] ?? "",
    );
    if (Number.isFinite(parsed)) return parsed;
    return estimateFuelConsumptionL100km(result.vehicle.specification);
  }

  const rows: {
    label: string;
    render: (result: VehicleSearchResult) => ReactNode;
    /** When set, the cell(s) with the best value across all compared cars get a subtle highlight. */
    compareValue?: (result: VehicleSearchResult) => number | undefined;
    betterWhen?: "lower" | "higher";
  }[] = [
    {
      label: copy.compare.price,
      render: (r) => moneyFormatter.format(r.listing.price.askingPrice.amount),
      compareValue: (r) => r.listing.price.askingPrice.amount,
      betterWhen: "lower",
    },
    {
      label: copy.compare.marketValue,
      render: (r) =>
        r.analysis.marketValue.comparableListingCount >= 3
          ? moneyFormatter.format(r.analysis.marketValue.value.amount)
          : copy.card.marketEstimatePending,
    },
    {
      label: copy.compare.dealScore,
      render: (r) => r.analysis.dealScore.value ?? copy.card.notRated,
      compareValue: (r) => r.analysis.dealScore.value ?? undefined,
      betterWhen: "higher",
    },
    {
      label: copy.compare.mileage,
      render: (r) => `${numberFormatter.format(r.listing.mileageKm / 10)} ${copy.card.mileageUnit}`,
      compareValue: (r) => r.listing.mileageKm,
      betterWhen: "lower",
    },
    {
      label: copy.compare.year,
      render: (r) => r.vehicle.identity.modelYear,
      compareValue: (r) => r.vehicle.identity.modelYear,
      betterWhen: "higher",
    },
    {
      label: copy.filters.fuel,
      render: (r) => copy.filters.fuels[r.vehicle.specification.powertrain.fuelType],
    },
    {
      label: copy.detail.fuelConsumption,
      render: (r) => {
        const real = r.vehicle.specification.powertrain.fuelConsumption;
        if (real) return real;
        const estimated = estimateFuelConsumptionL100km(r.vehicle.specification);
        return estimated !== undefined
          ? copy.detail.fuelConsumptionEstimated(`${numberFormatter.format(estimated)} L/100 km`)
          : "–";
      },
      compareValue: fuelConsumptionValue,
      betterWhen: "lower",
    },
    {
      label: copy.filters.transmission,
      render: (r) => copy.filters.transmissions[r.vehicle.specification.powertrain.transmission],
    },
    {
      label: copy.detail.drivetrain,
      render: (r) => {
        const drivetrain = r.vehicle.specification.powertrain.drivetrain;
        return drivetrain ? copy.filters.drivetrains[drivetrain] : "–";
      },
    },
    {
      label: copy.detail.engine,
      render: (r) => {
        const powertrain = r.vehicle.specification.powertrain;
        return (
          powertrain.engineDescription ??
          (powertrain.engineDisplacementCc
            ? `${(powertrain.engineDisplacementCc / 1000).toFixed(1)} L`
            : "–")
        );
      },
    },
    {
      label: copy.detail.horsepower,
      render: (r) =>
        r.vehicle.specification.powertrain.powerHp
          ? `${r.vehicle.specification.powertrain.powerHp} hk`
          : "–",
      compareValue: (r) => r.vehicle.specification.powertrain.powerHp ?? undefined,
      betterWhen: "higher",
    },
    {
      label: copy.filters.body,
      render: (r) => copy.filters.bodies[r.vehicle.specification.bodyStyle],
    },
    {
      label: copy.compare.sellerType,
      render: (r) =>
        r.listing.seller.type === "dealer" ? copy.card.dealerBadge : copy.card.privateSellerBadge,
    },
    {
      label: copy.compare.location,
      render: (r) => r.listing.location.municipality,
    },
  ];

  function bestResultIds(row: (typeof rows)[number]) {
    if (!row.compareValue || !row.betterWhen || results === null || results.length < 2) {
      return new Set<string>();
    }
    const values = results
      .map((result) => [result.listing.id, row.compareValue!(result)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== undefined);
    if (values.length < 2) return new Set<string>();
    const best =
      row.betterWhen === "lower"
        ? Math.min(...values.map(([, value]) => value))
        : Math.max(...values.map(([, value]) => value));
    const allTied = values.every(([, value]) => value === best);
    if (allTied) return new Set<string>();
    return new Set(values.filter(([, value]) => value === best).map(([id]) => id));
  }

  return (
    <div>
      <SiteHeader
        activePage="compare"
        compareCount={compared.length}
        locale={locale}
        onLocaleChange={changeLocale}
        savedCount={favorites.size}
      />

      <div className="mx-auto max-w-[1800px] px-5 py-8 sm:px-8 lg:px-12">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          onClick={() => router.back()}
          type="button"
        >
          <ArrowRightIcon className="size-4 rotate-180" />
          {copy.detail.back}
        </button>

        <div className="mt-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink">{copy.compare.title}</h1>
          {compared.length > 0 ? (
            <button
              className="text-sm font-medium text-ink-muted hover:text-ink"
              onClick={clear}
              type="button"
            >
              {copy.compare.clearAll}
            </button>
          ) : null}
        </div>

        {results === null ? (
          <p className="mt-6 text-sm text-ink-muted">…</p>
        ) : results.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-ink-muted">{copy.compare.emptyBody}</p>
            <Link
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-surface transition hover:opacity-90"
              href="/"
            >
              {copy.compare.browseCta}
            </Link>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table
              className="table-fixed border-collapse text-sm"
              style={{ width: 160 + 380 * results.length }}
            >
              <colgroup>
                <col className="w-40" />
                {results.map((result) => (
                  <col className="w-[380px]" key={result.listing.id} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="shrink-0 border-b border-border p-4 text-left align-bottom text-xs font-medium uppercase tracking-[0.04em] text-ink-subtle" />
                  {results.map((result) => (
                    <th
                      className="overflow-hidden border-b border-l border-border p-4 text-left align-bottom"
                      key={result.listing.id}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-muted">
                        {result.listing.images[0] ? (
                          <Image
                            alt={result.listing.images[0].alt ?? result.listing.title}
                            className="object-cover"
                            fill
                            sizes="380px"
                            src={result.listing.images[0].url}
                          />
                        ) : null}
                        <button
                          aria-label={copy.compare.remove}
                          className="absolute right-1.5 top-1.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface/90 text-ink-subtle transition hover:bg-surface hover:text-ink"
                          onClick={() => remove(result.listing.id)}
                          type="button"
                        >
                          <CloseIcon className="size-3.5" />
                        </button>
                      </div>
                      <Link
                        className="mt-3 flex min-w-0 items-start gap-2 hover:underline"
                        href={`/vehicle/${result.listing.id}`}
                      >
                        <BrandLogo className="size-8 shrink-0" make={result.vehicle.identity.make} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">
                            {result.vehicle.identity.make} {result.vehicle.identity.model}
                          </span>
                          {result.vehicle.identity.variant ? (
                            <span className="block truncate text-xs text-ink-muted">
                              {result.vehicle.identity.variant}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                      <a
                        className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-ink hover:underline"
                        href={result.listing.source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {copy.card.viewListing}
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const bestIds = bestResultIds(row);
                  return (
                    <tr key={row.label}>
                      <th
                        className="border-b border-border p-4 text-left text-xs font-medium text-ink-subtle"
                        scope="row"
                      >
                        {row.label}
                      </th>
                      {results.map((result) => (
                        <td
                          className={`overflow-hidden border-b border-l border-border p-4 font-medium ${
                            bestIds.has(result.listing.id)
                              ? "bg-accent-soft text-positive"
                              : "text-ink"
                          }`}
                          key={result.listing.id}
                        >
                          {row.render(result)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SiteFooter locale={locale} />
    </div>
  );
}
