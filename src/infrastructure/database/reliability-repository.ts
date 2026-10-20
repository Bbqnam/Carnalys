import "server-only";

import type {
  ReliabilityAssessment,
  ReliabilityConfidence,
  ReliabilityIssueSeverity,
  ReliabilityRiskLevel,
} from "@/domain/reliability";
import { selectReliabilityCandidate } from "@/domain/reliability";
import { prisma } from "./prisma";

export interface ReliabilityVehicleInput {
  make: string;
  model: string;
  modelYear: number;
  generation?: string | null;
  fuelType: string;
  transmission: string;
  engineDescription?: string | null;
}

const riskLevels = new Set<ReliabilityRiskLevel>(["low", "moderate", "high"]);
const confidences = new Set<ReliabilityConfidence>(["low", "medium", "high"]);
const severities = new Set<ReliabilityIssueSeverity>(["watch", "important", "critical"]);

function enumValue<T extends string>(value: string, allowed: Set<T>, fallback: T): T {
  return allowed.has(value as T) ? (value as T) : fallback;
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

async function loadCandidates(vehicle: ReliabilityVehicleInput) {
  return prisma.reliabilityProfile.findMany({
    where: {
      make: { equals: vehicle.make, mode: "insensitive" },
      model: { equals: vehicle.model, mode: "insensitive" },
      modelYearFrom: { lte: vehicle.modelYear },
      modelYearTo: { gte: vehicle.modelYear },
      AND: [
        { OR: [{ generation: null }, { generation: vehicle.generation ?? "" }] },
        { OR: [{ fuelType: null }, { fuelType: vehicle.fuelType }] },
        { OR: [{ transmission: null }, { transmission: vehicle.transmission }] },
      ],
      // An unsourced profile is an admin draft, never buyer-facing guidance.
      sources: { some: {} },
    },
    include: {
      issues: { orderBy: { createdAt: "asc" } },
      sources: { orderBy: { accessedAt: "desc" } },
    },
  });
}

export async function getReliabilityAssessmentForVehicle(
  vehicle: ReliabilityVehicleInput,
): Promise<ReliabilityAssessment | undefined> {
  const candidate = selectReliabilityCandidate(await loadCandidates(vehicle), vehicle) as Candidate | undefined;
  if (!candidate) return undefined;

  return {
    profileId: candidate.id,
    riskLevel: enumValue(candidate.riskLevel, riskLevels, "moderate"),
    confidence: enumValue(candidate.confidence, confidences, "low"),
    summary: candidate.summary,
    appliesTo: {
      make: candidate.make,
      model: candidate.model,
      modelYearFrom: candidate.modelYearFrom,
      modelYearTo: candidate.modelYearTo,
      generation: candidate.generation ?? undefined,
      fuelType: candidate.fuelType ?? undefined,
      transmission: candidate.transmission ?? undefined,
      enginePattern: candidate.enginePattern ?? undefined,
    },
    issues: candidate.issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      severity: enumValue(issue.severity, severities, "watch"),
      description: issue.description,
      symptoms: issue.symptoms ?? undefined,
      inspectionAdvice: issue.inspectionAdvice ?? undefined,
      typicalRepairCost:
        issue.typicalRepairCostMinimum !== null || issue.typicalRepairCostMaximum !== null
          ? {
              minimum: issue.typicalRepairCostMinimum ?? undefined,
              maximum: issue.typicalRepairCostMaximum ?? undefined,
              currency: "SEK" as const,
            }
          : undefined,
    })).toSorted((left, right) => {
      const rank = { watch: 1, important: 2, critical: 3 } as const;
      return rank[right.severity] - rank[left.severity];
    }),
    sources: candidate.sources.map((source) => ({
      id: source.id,
      label: source.label,
      url: source.url,
      publishedAt: source.publishedAt?.toISOString(),
      accessedAt: source.accessedAt.toISOString(),
    })),
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

export function listReliabilityProfiles() {
  return prisma.reliabilityProfile.findMany({
    include: {
      issues: { orderBy: { createdAt: "asc" } },
      sources: { orderBy: { accessedAt: "desc" } },
    },
    orderBy: [{ make: "asc" }, { model: "asc" }, { modelYearFrom: "desc" }],
  });
}

export function createReliabilityProfile(data: {
  make: string;
  model: string;
  generation: string | null;
  modelYearFrom: number;
  modelYearTo: number;
  fuelType: string | null;
  transmission: string | null;
  enginePattern: string | null;
  riskLevel: ReliabilityRiskLevel;
  confidence: ReliabilityConfidence;
  summary: string;
}) {
  return prisma.reliabilityProfile.create({ data });
}

export function deleteReliabilityProfile(id: string) {
  return prisma.reliabilityProfile.deleteMany({ where: { id } });
}

export function addReliabilityIssue(data: {
  profileId: string;
  title: string;
  severity: ReliabilityIssueSeverity;
  description: string;
  symptoms: string | null;
  inspectionAdvice: string | null;
  typicalRepairCostMinimum: number | null;
  typicalRepairCostMaximum: number | null;
}) {
  return prisma.reliabilityIssue.create({ data });
}

export function deleteReliabilityIssue(id: string) {
  return prisma.reliabilityIssue.deleteMany({ where: { id } });
}

export function addReliabilitySource(data: {
  profileId: string;
  label: string;
  url: string;
  publishedAt: Date | null;
}) {
  return prisma.reliabilitySource.create({ data });
}

export function deleteReliabilitySource(id: string) {
  return prisma.reliabilitySource.deleteMany({ where: { id } });
}
