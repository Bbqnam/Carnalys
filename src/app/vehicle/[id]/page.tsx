import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createNumberFormatter } from "@/features/search/format";
import { defaultLocale, isLocale, localeCookieName } from "@/features/search/locale";
import { VehicleDetail } from "@/features/vehicle-detail/vehicle-detail";
import {
  getListingById,
  getListingSummaryById,
} from "@/infrastructure/database/vehicle-listing-repository";

interface VehiclePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: VehiclePageProps): Promise<Metadata> {
  const { id } = await params;
  const summary = await getListingSummaryById(id);
  if (!summary) return { title: "Car not found" };

  const { make, model, variant, modelYear, mileageKm, priceAmount } = summary;
  // The tab is the narrowest place this name is ever shown, so the car leads
  // and everything optional trails it: "Audi A3 · Sportback 35 TFSI S Tronic".
  // No "· Carnalys" suffix — the favicon already says whose tab this is, and
  // the suffix would only eat room the model name needs.
  const name = `${make} ${model}`;
  const numbers = createNumberFormatter(defaultLocale);

  const title = variant ? `${name} · ${variant}` : name;
  const description =
    `${modelYear} ${name}${variant ? ` ${variant}` : ""}, ` +
    `${numbers.format(Math.round(mileageKm / 10))} mil, ` +
    `${numbers.format(priceAmount)} kr in ${summary.municipality}. ` +
    "See its Deal Score, estimated market value and ownership cost on Carnalys.";

  // Link unfurls (Messenger, iMessage, Slack, WhatsApp…) read Open Graph /
  // Twitter-card tags. Lead with the car's first photo so a shared listing
  // shows the vehicle, not a generic site card.
  const images = summary.imageUrl ? [{ url: summary.imageUrl, alt: title }] : undefined;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      ...(images ? { images: [summary.imageUrl!] } : {}),
    },
  };
}

export default async function VehiclePage({ params }: VehiclePageProps) {
  await connection();
  const { id } = await params;
  const [result, localeCookie] = await Promise.all([
    getListingById(id),
    cookies().then((store) => store.get(localeCookieName)?.value),
  ]);

  if (!result) notFound();

  return (
    <VehicleDetail
      locale={isLocale(localeCookie) ? localeCookie : defaultLocale}
      result={result}
    />
  );
}
