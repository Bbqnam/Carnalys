import { hasFreshHostConfirmation } from "@/domain/market/listing-availability";
import { rankSimilarVehicles, similarVehicleBudgetRatio, type SimilarVehicle, type SimilarVehicleRecommendation } from "@/domain/market/similar-vehicles";
import { classifyVehicleKind } from "@/domain/vehicle/analysis/listing-assessment";
import { listingSource } from "@/infrastructure/marketplaces/source-registry";
import { loadAvailabilityListings, verifyHostAvailability } from "./listing-availability-repository";
import { initializeDatabase, prisma } from "./prisma";

const selection = {
  id: true, vehicleId: true, title: true, provider: true, listingUrl: true,
  priceAmount: true, mileageKm: true, mileageKnown: true, municipality: true, valuationEligible: true,
  images: { select: { url: true }, orderBy: { position: "asc" as const }, take: 1 },
  vehicle: { select: { make: true, model: true, modelYear: true, bodyStyle: true,
    fuelType: true, transmission: true, generation: true, horsepower: true, variant: true } },
} as const;

export async function getVerifiedSimilarVehicles(listingId: string): Promise<{ vehicles: SimilarVehicleRecommendation[]; checked: number }> {
  await initializeDatabase();
  const target = await prisma.listingRecord.findFirst({ where: { id: listingId, status: "active" }, select: selection });
  if (!target || !target.valuationEligible || target.priceAmount <= 0 || target.vehicle.bodyStyle === "other" ||
      classifyVehicleKind({ ...target.vehicle, title: target.title }) !== "passenger_car") return { vehicles: [], checked: 0 };
  const where = {
      status: "active", valuationEligible: true, mileageKnown: true, validationStatus: { not: "unchecked" },
      vehicleId: { not: target.vehicleId },
      priceAmount: { gte: Math.ceil(target.priceAmount * (1 - similarVehicleBudgetRatio)), lte: Math.floor(target.priceAmount * (1 + similarVehicleBudgetRatio)) },
      vehicle: { is: { bodyStyle: target.vehicle.bodyStyle,
        ...(target.vehicle.fuelType === "other" ? {} : { fuelType: target.vehicle.fuelType }),
        ...(target.vehicle.transmission === "other" ? {} : { transmission: target.vehicle.transmission }),
        modelYear: { gte: target.vehicle.modelYear - 5, lte: target.vehicle.modelYear + 5 },
      } },
    };
  // Keep same-family cars in consideration even when a busy source has just
  // flooded the general pool with newer cross-model adverts.
  const [sameFamily, alternatives] = await Promise.all([
    prisma.listingRecord.findMany({ where: { ...where, vehicle: { is: { ...where.vehicle.is, make: target.vehicle.make, model: target.vehicle.model } } },
      select: selection, orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }], take: 80 }),
    prisma.listingRecord.findMany({ where, select: selection, orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }], take: 100 }),
  ]);
  const candidates = [...new Map([...sameFamily, ...alternatives].map(row => [row.id, row])).values()];
  const toComparable = (row: typeof target): SimilarVehicle => ({ ...row.vehicle, ...row });
  const byId = new Map(candidates.map(row => [row.id, row]));
  const ranked = rankSimilarVehicles(toComparable(target), candidates.filter(row =>
    classifyVehicleKind({ ...row.vehicle, title: row.title }) === "passenger_car").map(toComparable));
  const sourceCounts = new Map<string, number>();
  const verificationPool = ranked.filter(row => {
    const source = byId.get(row.id)!.provider;
    const count = sourceCounts.get(source) ?? 0;
    if (count >= 6) return false;
    sourceCounts.set(source, count + 1);
    return true;
  }).slice(0, 12);
  const checks = await loadAvailabilityListings(verificationPool.map(row => row.id));
  const checkById = new Map(checks.map(row => [row.id, row]));
  const blocked = new Set<string>();
  const deadline = Date.now() + 16_000;
  let index = 0;
  let checked = 0;
  const lane = async () => {
    while (index < verificationPool.length && Date.now() < deadline) {
      const candidate = checkById.get(verificationPool[index++].id);
      if (!candidate || blocked.has(candidate.provider)) continue;
      const result = await verifyHostAvailability(candidate);
      checked++;
      if (result.httpStatus === 403 || result.httpStatus === 429) blocked.add(candidate.provider);
    }
  };
  await Promise.all([lane(), lane()]);
  // Read again so concurrent removal/price changes win over an earlier check.
  const verified = await loadAvailabilityListings(checks.map(row => row.id));
  const live = new Map(verified.filter(row => hasFreshHostConfirmation(row)).map(row => [row.id, row]));
  const reranked = rankSimilarVehicles(toComparable(target), ranked.flatMap(row => {
    const current = live.get(row.id);
    return current ? [{ ...row, priceAmount: current.priceAmount }] : [];
  }));
  return { checked, vehicles: reranked.slice(0, 6).map(row => {
    const listing = byId.get(row.id)!;
    return { id: row.id, title: listing.title ?? `${row.make} ${row.model}`, priceAmount: row.priceAmount,
      modelYear: row.modelYear, mileageKm: row.mileageKm, imageUrl: listing.images[0]?.url ?? null,
      municipality: listing.municipality, sourceName: listingSource(listing.provider).displayName,
      sourceUrl: listing.listingUrl, confirmedAt: live.get(row.id)!.availabilityConfirmedAt!.toISOString(),
      sameModel: row.make === target.vehicle.make && row.model === target.vehicle.model };
  }) };
}
