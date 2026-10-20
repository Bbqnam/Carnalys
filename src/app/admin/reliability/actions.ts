"use server";

import { revalidatePath } from "next/cache";
import type {
  ReliabilityConfidence,
  ReliabilityIssueSeverity,
  ReliabilityRiskLevel,
} from "@/domain/reliability";
import { requireAdmin } from "@/features/auth/session";
import {
  addReliabilityIssue,
  addReliabilitySource,
  createReliabilityProfile,
  deleteReliabilityIssue,
  deleteReliabilityProfile,
  deleteReliabilitySource,
} from "@/infrastructure/database/reliability-repository";

export type ReliabilityFormState = { error?: string; success?: boolean };

const riskLevels = new Set<ReliabilityRiskLevel>(["low", "moderate", "high"]);
const confidences = new Set<ReliabilityConfidence>(["low", "medium", "high"]);
const severities = new Set<ReliabilityIssueSeverity>(["watch", "important", "critical"]);

function textField(formData: FormData, name: string, maximum = 2_000) {
  return String(formData.get(name) ?? "").trim().slice(0, maximum);
}

function integerField(formData: FormData, name: string): number | null {
  const raw = textField(formData, name, 20);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function refreshReliabilityViews() {
  revalidatePath("/admin/reliability");
  revalidatePath("/vehicle/[id]", "page");
}

export async function createReliabilityProfileAction(
  _state: ReliabilityFormState,
  formData: FormData,
): Promise<ReliabilityFormState> {
  await requireAdmin();
  const make = textField(formData, "make", 80);
  const model = textField(formData, "model", 80);
  const generation = textField(formData, "generation", 80);
  const modelYearFrom = integerField(formData, "modelYearFrom");
  const modelYearTo = integerField(formData, "modelYearTo");
  const fuelType = textField(formData, "fuelType", 80);
  const transmission = textField(formData, "transmission", 80);
  const enginePattern = textField(formData, "enginePattern", 120);
  const riskLevel = textField(formData, "riskLevel", 20) as ReliabilityRiskLevel;
  const confidence = textField(formData, "confidence", 20) as ReliabilityConfidence;
  const summary = textField(formData, "summary");

  if (!make || !model) return { error: "Make and model are required." };
  if (!modelYearFrom || !modelYearTo || modelYearFrom > modelYearTo) {
    return { error: "Enter a valid model-year range." };
  }
  if (!riskLevels.has(riskLevel) || !confidences.has(confidence)) {
    return { error: "Choose valid risk and confidence levels." };
  }
  if (summary.length < 20) return { error: "Add a useful evidence summary." };

  await createReliabilityProfile({
    make,
    model,
    generation: generation || null,
    modelYearFrom,
    modelYearTo,
    fuelType: fuelType || null,
    transmission: transmission || null,
    enginePattern: enginePattern || null,
    riskLevel,
    confidence,
    summary,
  });
  refreshReliabilityViews();
  return { success: true };
}

export async function addReliabilityIssueAction(
  _state: ReliabilityFormState,
  formData: FormData,
): Promise<ReliabilityFormState> {
  await requireAdmin();
  const profileId = textField(formData, "profileId", 80);
  const title = textField(formData, "title", 160);
  const severity = textField(formData, "severity", 20) as ReliabilityIssueSeverity;
  const description = textField(formData, "description");
  const symptoms = textField(formData, "symptoms");
  const inspectionAdvice = textField(formData, "inspectionAdvice");
  const typicalRepairCostMinimum = integerField(formData, "typicalRepairCostMinimum");
  const typicalRepairCostMaximum = integerField(formData, "typicalRepairCostMaximum");

  if (!profileId || !title || description.length < 10) {
    return { error: "Issue title and description are required." };
  }
  if (!severities.has(severity)) return { error: "Choose a valid severity." };
  if (
    typicalRepairCostMinimum !== null &&
    typicalRepairCostMaximum !== null &&
    typicalRepairCostMinimum > typicalRepairCostMaximum
  ) {
    return { error: "Minimum repair cost cannot exceed the maximum." };
  }

  await addReliabilityIssue({
    profileId,
    title,
    severity,
    description,
    symptoms: symptoms || null,
    inspectionAdvice: inspectionAdvice || null,
    typicalRepairCostMinimum,
    typicalRepairCostMaximum,
  });
  refreshReliabilityViews();
  return { success: true };
}

export async function addReliabilitySourceAction(
  _state: ReliabilityFormState,
  formData: FormData,
): Promise<ReliabilityFormState> {
  await requireAdmin();
  const profileId = textField(formData, "profileId", 80);
  const label = textField(formData, "label", 160);
  const urlValue = textField(formData, "url", 1_500);
  const publishedAtValue = textField(formData, "publishedAt", 30);
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return { error: "Enter a valid evidence URL." };
  }
  if (!profileId || !label || !["http:", "https:"].includes(url.protocol)) {
    return { error: "Profile, source label and an HTTP(S) URL are required." };
  }
  const publishedAt = publishedAtValue ? new Date(publishedAtValue) : null;
  if (publishedAt && Number.isNaN(publishedAt.getTime())) {
    return { error: "Published date is invalid." };
  }

  try {
    await addReliabilitySource({ profileId, label, url: url.toString(), publishedAt });
  } catch {
    return { error: "That source is already attached to this profile." };
  }
  refreshReliabilityViews();
  return { success: true };
}

export async function deleteReliabilityProfileAction(formData: FormData) {
  await requireAdmin();
  await deleteReliabilityProfile(textField(formData, "id", 80));
  refreshReliabilityViews();
}

export async function deleteReliabilityIssueAction(formData: FormData) {
  await requireAdmin();
  await deleteReliabilityIssue(textField(formData, "id", 80));
  refreshReliabilityViews();
}

export async function deleteReliabilitySourceAction(formData: FormData) {
  await requireAdmin();
  await deleteReliabilitySource(textField(formData, "id", 80));
  refreshReliabilityViews();
}
