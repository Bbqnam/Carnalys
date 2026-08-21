import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { defaultLocale, isLocale, localeCookieName } from "@/features/search/locale";
import { VehicleDetail } from "@/features/vehicle-detail/vehicle-detail";
import { getListingById } from "@/infrastructure/database/vehicle-listing-repository";

interface VehiclePageProps {
  params: Promise<{ id: string }>;
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
