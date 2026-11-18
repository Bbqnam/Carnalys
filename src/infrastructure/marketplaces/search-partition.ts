import type { VehicleSearchPartition } from "@/application/ingestion/types";

function midpoint(from: number, to: number) {
  return from + Math.floor((to - from) / 2);
}

export function splitVehicleSearchPartition(partition: VehicleSearchPartition): readonly VehicleSearchPartition[] {
  if (partition.yearFrom < partition.yearTo) {
    const middle = midpoint(partition.yearFrom, partition.yearTo);
    return [
      { ...partition, yearFrom: middle + 1 },
      { ...partition, yearTo: middle },
    ];
  }

  if (partition.priceFrom < partition.priceTo) {
    const middle = midpoint(partition.priceFrom, partition.priceTo);
    return [
      { ...partition, priceFrom: middle + 1 },
      { ...partition, priceTo: middle, unboundedPriceTo: false },
    ];
  }

  if (partition.mileageFrom < partition.mileageTo) {
    const middle = midpoint(partition.mileageFrom, partition.mileageTo);
    return [
      { ...partition, mileageFrom: middle + 1 },
      { ...partition, mileageTo: middle },
    ];
  }

  throw new Error(
    `Kunde inte dela en överfull sökpartition (${partition.yearFrom}, ${partition.priceFrom} kr, ${partition.mileageFrom} mil).`,
  );
}
