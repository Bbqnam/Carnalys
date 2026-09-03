export interface HistoryObservation {
  observedAt: Date;
  kind: string;
  priceAmount: number;
  previousPriceAmount: number | null;
  mileageKm: number;
  previousMileageKm: number | null;
  status: string;
  provenance: "observed" | "reconstructed";
}

export interface ExactListingHistory {
  firstSeenAt: string;
  lastSeenAt: string;
  currentStatus: string;
  priceChanges: readonly {
    observedAt: string;
    fromAmount: number;
    toAmount: number;
    direction: "increase" | "decrease";
  }[];
  mileageChanges: readonly {
    observedAt: string;
    fromKm: number;
    toKm: number;
  }[];
  lifecycle: readonly {
    observedAt: string;
    kind: "disappeared" | "relisted";
    statement: string;
  }[];
  warnings: readonly string[];
}

export function summarizeExactListingHistory(input: {
  firstSeenAt: Date;
  lastSeenAt: Date;
  status: string;
  observations: readonly HistoryObservation[];
}): ExactListingHistory {
  const ordered = [...input.observations]
    .sort((a, b) => a.observedAt.valueOf() - b.observedAt.valueOf())
    .slice(-30);
  const priceChanges = ordered.flatMap((event) =>
    event.kind === "price_change" && event.previousPriceAmount !== null
      ? [{
          observedAt: event.observedAt.toISOString(),
          fromAmount: event.previousPriceAmount,
          toAmount: event.priceAmount,
          direction: event.priceAmount < event.previousPriceAmount
            ? ("decrease" as const)
            : ("increase" as const),
        }]
      : [],
  );
  const mileageChanges = ordered.flatMap((event) =>
    event.kind === "mileage_change" && event.previousMileageKm !== null
      ? [{
          observedAt: event.observedAt.toISOString(),
          fromKm: event.previousMileageKm,
          toKm: event.mileageKm,
        }]
      : [],
  );
  const lifecycle = ordered.flatMap<ExactListingHistory["lifecycle"][number]>((event) => {
    if (event.kind === "disappeared") {
      return [{
        observedAt: event.observedAt.toISOString(),
        kind: "disappeared" as const,
        statement: "The advert disappeared from its source; this does not confirm a sale.",
      }];
    }
    if (event.kind === "relisted") {
      return [{
        observedAt: event.observedAt.toISOString(),
        kind: "relisted" as const,
        statement: "Carnalys observed the advert active again.",
      }];
    }
    return [];
  });
  const warnings: string[] = [];
  if (input.observations.some((event) => event.provenance === "reconstructed")) {
    warnings.push("The initial state was reconstructed from the listing record; changes before live observation history began are unavailable.");
  }
  if (input.status !== "active") {
    warnings.push("An inactive or disappeared advert is not evidence that the vehicle sold, nor of its sale price.");
  }
  return {
    firstSeenAt: input.firstSeenAt.toISOString(),
    lastSeenAt: input.lastSeenAt.toISOString(),
    currentStatus: input.status,
    priceChanges,
    mileageChanges,
    lifecycle,
    warnings,
  };
}
