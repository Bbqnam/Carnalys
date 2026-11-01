"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { SimilarVehicleRecommendation } from "@/domain/market/similar-vehicles";
import { recommendationVerificationMaxAgeMs } from "@/domain/market/listing-availability";
import type { Locale } from "@/features/search/copy";
import { createMoneyFormatter, createNumberFormatter } from "@/features/search/format";

export function SimilarVehicles({ listingId, locale }: { listingId: string; locale: Locale }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${listingId}:${attempt}`;
  const [response, setResponse] = useState<{ key: string; vehicles: SimilarVehicleRecommendation[]; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listings/${encodeURIComponent(listingId)}/similar`, { signal: controller.signal, cache: "no-store" })
      .then(async result => {
        if (!result.ok) throw new Error("Availability request failed");
        const payload = await result.json() as { vehicles: SimilarVehicleRecommendation[] };
        if (!controller.signal.aborted) setResponse({ key, vehicles: payload.vehicles, failed: false });
      })
      .catch(() => { if (!controller.signal.aborted) setResponse({ key, vehicles: [], failed: true }); });
    return () => controller.abort();
  }, [listingId, key]);
  const current = response?.key === key ? response : null;
  useEffect(() => {
    if (!current?.vehicles.length) return;
    const expiresAt = Math.min(...current.vehicles.map(car => new Date(car.confirmedAt).getTime())) + recommendationVerificationMaxAgeMs;
    const refresh = () => { if (document.visibilityState === "visible" && Date.now() >= expiresAt) setAttempt(value => value + 1); };
    const timer = window.setTimeout(refresh, Math.max(1, expiresAt - Date.now()));
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [current]);
  const money = createMoneyFormatter(locale);
  const numbers = createNumberFormatter(locale);
  const time = new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  return (
    <section aria-labelledby="similar-vehicles-title" className="mt-8 border-t border-border pt-6">
      <h2 id="similar-vehicles-title" className="text-xl font-semibold text-ink">{locale === "sv" ? "Liknande bilar till salu" : "Similar cars for sale"}</h2>
      <p className="mt-1 text-sm text-ink-muted">{locale === "sv" ? "Liknande biltyp och pris. Vi kontrollerar annonsen och priset hos säljplatsen innan bilen visas här." : "Similar vehicle type and price. We check the advert and asking price on the original site before showing a car here."}</p>
      <div aria-live="polite" aria-busy={!current} className="mt-4">
        {!current ? <p className="text-sm text-ink-muted">{locale === "sv" ? "Kontrollerar vilka bilar som fortfarande finns till salu…" : "Checking which cars are still listed for sale…"}</p> :
          current.vehicles.length === 0 ? <p className="text-sm text-ink-muted">{locale === "sv" ? "Inga liknande bilar kunde bekräftas just nu. Prova igen senare." : "No similar cars could be confirmed right now. Please try again later."}</p> :
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{current.vehicles.map(car => (
            <li key={car.id} className="overflow-hidden rounded-xl border border-border bg-surface">
              <Link href={`/vehicle/${car.id}`} prefetch={false} className="block">
                <div className="relative aspect-[16/10] bg-surface-subtle">
                  <Image src={car.imageUrl ?? "/images/vehicle-fallback.svg"} alt={car.title} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw" className="object-cover" />
                </div>
                <div className="p-3 pb-1">
                  <h3 className="truncate text-sm font-semibold text-ink">{car.title}</h3>
                  <p className="mt-1 text-xs text-ink-muted">{car.modelYear} · {numbers.format(Math.round(car.mileageKm / 10))} mil · {car.municipality}</p>
                  <p className="mt-2 font-semibold text-ink">{money.format(car.priceAmount)}</p>
                </div>
              </Link>
              <div className="p-3 pt-1">
                <p className="text-[11px] text-ink-muted">{locale === "sv" ? "Kontrollerad" : "Checked"} {time.format(new Date(car.confirmedAt))} · {car.sourceName}</p>
                <a href={car.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-accent hover:underline">{locale === "sv" ? `Se annons hos ${car.sourceName}` : `View advert on ${car.sourceName}`} ↗</a>
              </div>
            </li>
          ))}</ul>}
      </div>
      {current ? <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-surface-subtle">{locale === "sv" ? "Kontrollera igen" : "Check again"}</button> : null}
    </section>
  );
}
