import type { ServiceHistoryStatus } from "../listing";

export type MileageStatus = "verified" | "plausible" | "unknown" | "suspicious";
export type DefectCategory =
  | "none"
  | "minor_cosmetic"
  | "minor_mechanical"
  | "significant_mechanical"
  | "major_defect"
  | "repair_object";
export type VehicleKind =
  | "passenger_car"
  | "a_tractor"
  | "light_commercial"
  | "motorhome"
  | "special_vehicle"
  | "unknown";

function searchable(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("sv-SE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function assessMileage(
  mileageKm: number,
  ageYears: number,
  text?: string | null,
): MileageStatus {
  if (!Number.isFinite(mileageKm) || mileageKm < 0 || mileageKm > 1_000_000) {
    return "suspicious";
  }
  if (mileageKm === 0) {
    return ageYears <= 1 && /\b(ny|fabriksny|leveransmil)\b/i.test(text ?? "")
      ? "verified"
      : "unknown";
  }
  if (ageYears >= 5 && mileageKm < 1_000) return "suspicious";
  if (ageYears >= 10 && mileageKm < 5_000) return "suspicious";
  if (ageYears <= 1 && mileageKm > 100_000) return "suspicious";
  if (ageYears <= 3 && mileageKm > 200_000) return "suspicious";
  return "plausible";
}

const repairedContext =
  /\b(bytt|byttes|utbytt|renoverad|reparerad|atgardad|fixad)\b.{0,80}\b(fungerar|felfri|utan problem|idag|sedan dess|gar bra)\b|\b(fungerar|felfri|utan problem|idag|sedan dess|gar bra)\b.{0,80}\b(bytt|byttes|utbytt|renoverad|reparerad|atgardad|fixad)\b/i;

const defectPatterns: readonly {
  category: DefectCategory;
  pattern: RegExp;
}[] = [
  {
    category: "repair_object",
    pattern: /\b(rep\s*object|repobjekt|reparationsobjekt|reservdelsbil|reservdelar)\b/i,
  },
  {
    category: "major_defect",
    pattern:
      /\b(motorhaveri|motorfel|vaxelladsfel|vaxellada\s+trasig|startar\s+(inte|ej)|gar\s+(inte|ej)|ej\s+korbar|bogseras|krockskadad|brandskadad|vattenskadad|motor\s+trasig)\b/i,
  },
  {
    category: "significant_mechanical",
    pattern:
      /\b(defekt|kopplingsfel|turbo\s*fel|kamkedj\w*\s+(fel|problem)|oljelackage|kylvatskelackage|missljud\s+(fran|i)\s+(motor|vaxellada))\b/i,
  },
  {
    category: "minor_mechanical",
    pattern:
      /\b(ac\s+(fungerar\s+inte|ur\s+funktion)|sensor\s+fel|varningslampa|mindre\s+fel|behover\s+atgardas)\b/i,
  },
  {
    category: "minor_cosmetic",
    pattern: /\b(repor|repa|buckla|dorruppslag|lackskada|kosmetisk\w*\s+skada|stensprut)\b/i,
  },
];

export function assessDefects(title: string | null, description: string | null) {
  const sentences = `${title ?? ""}. ${description ?? ""}`
    .split(/[.!?\n]+/)
    .map(searchable)
    .filter(Boolean);

  let result: DefectCategory = "none";
  const rank: Record<DefectCategory, number> = {
    none: 0,
    minor_cosmetic: 1,
    minor_mechanical: 2,
    significant_mechanical: 3,
    major_defect: 4,
    repair_object: 5,
  };
  for (const sentence of sentences) {
    for (const candidate of defectPatterns) {
      if (!candidate.pattern.test(sentence)) continue;
      if (rank[candidate.category] >= 3 && repairedContext.test(sentence)) continue;
      if (rank[candidate.category] > rank[result]) result = candidate.category;
    }
  }
  return result;
}

export function defectModifier(category: DefectCategory) {
  switch (category) {
    case "minor_mechanical":
      return -3;
    case "significant_mechanical":
      return -12;
    case "major_defect":
    case "repair_object":
      return null;
    default:
      return 0;
  }
}

export function serviceHistoryModifier(status: ServiceHistoryStatus) {
  switch (status) {
    case "complete":
      return 3;
    case "partial":
      return 1;
    case "missing":
      return -4;
    default:
      return 0;
  }
}

export function classifyVehicleKind(input: {
  title?: string | null;
  model?: string | null;
  variant?: string | null;
  bodyStyle?: string | null;
}): VehicleKind {
  const text = searchable(`${input.title ?? ""} ${input.model ?? ""} ${input.variant ?? ""}`);
  if (/\b(a traktor|atraktor|epa traktor|epatraktor)\b/.test(text)) return "a_tractor";
  if (/\b(husbil|motorhome|campervan|platis)\b/.test(text)) return "motorhome";
  if (/\b(ambulans|likbil|brandbil|arbetsfordon|specialfordon)\b/.test(text)) {
    return "special_vehicle";
  }
  if (input.bodyStyle === "van" || /\b(skapbil|latt lastbil|transportbil)\b/.test(text)) {
    return "light_commercial";
  }
  if (input.bodyStyle && input.bodyStyle !== "other") return "passenger_car";
  return "unknown";
}

export function transparencyScore(input: {
  registrationNumber: boolean;
  vin: boolean;
  description: string | null;
  serviceHistory: ServiceHistoryStatus;
  ownerCount: number | null;
  defectCategory: DefectCategory;
}) {
  const text = searchable(input.description);
  let score = 38;
  if (input.registrationNumber) score += 10;
  if (input.vin) score += 8;
  if (text.length >= 120) score += 7;
  if (text.length >= 350) score += 5;
  if (input.serviceHistory !== "unknown") score += 10;
  if (input.ownerCount !== null) score += 7;
  if (/\b(besikt|inspektion|kontrollerad)\b/.test(text)) score += 6;
  if (/\b(dack|vinterhjul|sommardack|monsterdjup)\b/.test(text)) score += 5;
  if (/\b(skick|repor|buckla|lackskada|nyservad|bromsar|kamrem)\b/.test(text)) score += 5;
  if (input.defectCategory !== "none") score += 6;
  return Math.max(10, Math.min(95, score));
}

export function sellerProtectionScore(input: {
  sellerType: string;
  title: string | null;
  description: string | null;
}) {
  const text = searchable(`${input.title ?? ""} ${input.description ?? ""}`);
  if (input.sellerType === "private") return 50;
  if (/\b(certifierad begagnad|approved used|selekt|das welt auto|toyota quality)\b/.test(text)) {
    return 85;
  }
  const warranty = text.match(/\b(\d{1,2})\s*(manaders?|man|ar)\s+(garanti|trygghet)\b/);
  if (warranty) return Number(warranty[1]) >= 12 ? 78 : 66;
  if (/\b(garanti|begagnatgaranti|trafiksakerhetsgaranti)\b/.test(text)) return 62;
  return 50;
}
