export interface EquipmentAssessment {
  score: number;
  coverage: "known" | "missing";
  weightedPoints: number;
  matchedFeatureCount: number;
}

const featureTiers: readonly { points: number; patterns: readonly RegExp[] }[] = [
  {
    points: 5,
    patterns: [
      /dragkrok|tow.?bar/i,
      /panorama/i,
      /360.?kamera|around.?view/i,
      /matrix|pixel.?light|laser.?light/i,
      /adaptiv.*fjadr|luftfjadr|adaptive suspension/i,
      /harman|bose|bowers|burmester|premium.*ljud/i,
      /elstol|elektrisk.*stol/i,
      /minnesstol|stol.*minne/i,
      /vinterhjul/i,
      /varmepump|heat.?pump/i,
      /fyrhjulsdrift|\bawd\b|\b4wd\b|quattro|xdrive|4matic/i,
      /stora batter|long range|extended range/i,
      /parkeringsvarm|dieselvarm|branslevarm/i,
    ],
  },
  {
    points: 3,
    patterns: [
      /adaptiv.*farth|adaptive cruise|\bacc\b/i,
      /backkamera|rear.?camera/i,
      /rattvarm|uppvarmd.*ratt/i,
      /keyless|nyckelfri/i,
      /navigation|gps/i,
      /tradlos.*ladd|wireless charg/i,
      /parkeringssensor|pdc/i,
      /blind.?spot|doda.?vinkel/i,
    ],
  },
  {
    points: 1,
    patterns: [
      /ambient/i,
      /tonade.*rutor/i,
      /avbland.*spegel|auto.?dim/i,
      /regnsensor/i,
      /bluetooth/i,
      /filvarn|lane warning/i,
    ],
  },
];

export function equipmentPoints(labels: readonly string[]) {
  const matched = new Set<string>();
  let points = 0;
  for (const label of labels) {
    for (const tier of featureTiers) {
      const pattern = tier.patterns.find((candidate) => candidate.test(label));
      if (!pattern) continue;
      const key = pattern.source;
      if (!matched.has(key)) {
        matched.add(key);
        points += tier.points;
      }
      break;
    }
  }
  return { points, matchedFeatureCount: matched.size };
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

export function assessEquipment(
  labels: readonly string[],
  comparableLabelSets: readonly (readonly string[])[],
): EquipmentAssessment {
  const own = equipmentPoints(labels);
  if (labels.length === 0) {
    return { score: 50, coverage: "missing", weightedPoints: 0, matchedFeatureCount: 0 };
  }
  const comparablePoints = comparableLabelSets
    .filter((set) => set.length > 0)
    .map((set) => equipmentPoints(set).points);
  if (comparablePoints.length < 3) {
    return {
      score: 50,
      coverage: "known",
      weightedPoints: own.points,
      matchedFeatureCount: own.matchedFeatureCount,
    };
  }
  const benchmark = median(comparablePoints);
  const difference = own.points - benchmark;
  const score = Math.max(10, Math.min(95, Math.round(50 + difference * 4)));
  return {
    score,
    coverage: "known",
    weightedPoints: own.points,
    matchedFeatureCount: own.matchedFeatureCount,
  };
}
