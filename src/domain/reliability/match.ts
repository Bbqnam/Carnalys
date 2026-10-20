export interface ReliabilityMatchCandidate {
  generation: string | null;
  fuelType: string | null;
  transmission: string | null;
  enginePattern: string | null;
  modelYearFrom: number;
  modelYearTo: number;
}

export interface ReliabilityMatchVehicle {
  engineDescription?: string | null;
}

/** Chooses the narrowest compatible profile after database-level matching. */
export function selectReliabilityCandidate<T extends ReliabilityMatchCandidate>(
  candidates: readonly T[],
  vehicle: ReliabilityMatchVehicle,
): T | undefined {
  const engine = vehicle.engineDescription?.toLocaleLowerCase("sv-SE") ?? "";
  return candidates
    .filter((candidate) => {
      if (!candidate.enginePattern) return true;
      return engine.includes(candidate.enginePattern.toLocaleLowerCase("sv-SE"));
    })
    .toSorted((left, right) => {
      const score = (candidate: T) =>
        (candidate.generation ? 16 : 0) +
        (candidate.enginePattern ? 12 : 0) +
        (candidate.fuelType ? 6 : 0) +
        (candidate.transmission ? 4 : 0) -
        (candidate.modelYearTo - candidate.modelYearFrom);
      return score(right) - score(left);
    })[0];
}
