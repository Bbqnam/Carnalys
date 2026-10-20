export type ReliabilityRiskLevel = "low" | "moderate" | "high";
export type ReliabilityConfidence = "low" | "medium" | "high";
export type ReliabilityIssueSeverity = "watch" | "important" | "critical";

export interface ReliabilityIssueAssessment {
  id: string;
  title: string;
  severity: ReliabilityIssueSeverity;
  description: string;
  symptoms?: string;
  inspectionAdvice?: string;
  typicalRepairCost?: {
    minimum?: number;
    maximum?: number;
    currency: "SEK";
  };
}

export interface ReliabilityAssessment {
  profileId: string;
  riskLevel: ReliabilityRiskLevel;
  confidence: ReliabilityConfidence;
  summary: string;
  appliesTo: {
    make: string;
    model: string;
    modelYearFrom: number;
    modelYearTo: number;
    generation?: string;
    fuelType?: string;
    transmission?: string;
    enginePattern?: string;
  };
  issues: readonly ReliabilityIssueAssessment[];
  sources: readonly {
    id: string;
    label: string;
    url: string;
    publishedAt?: string;
    accessedAt: string;
  }[];
  updatedAt: string;
}
