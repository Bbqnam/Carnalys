"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/session";
import {
  createInsuranceProfile,
  createInsuranceQuote,
  deleteInsuranceProfile,
  deleteInsuranceQuote,
  estimateInsuranceForVehicle,
  findVehicleByRegistrationNumber,
  type VehicleLookupResult,
} from "@/infrastructure/database/insurance-repository";
import type { InsuranceCoverageLevel } from "@/generated/prisma/enums";
import type { InsuranceEstimate } from "@/domain/insurance";

export type FormState = { error?: string; success?: boolean };

function numberField(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function createProfileAction(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const ageBand = String(formData.get("ageBand") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const licenceYears = numberField(formData, "licenceYears");
  const annualMileageKm = numberField(formData, "annualMileageKm");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!label) return { error: "Give the profile a short label." };
  if (!ageBand) return { error: "Age band is required." };
  if (!region) return { error: "Region is required." };
  if (licenceYears === undefined || licenceYears < 0) return { error: "Licence years must be a number." };
  if (annualMileageKm === undefined || annualMileageKm < 0) {
    return { error: "Annual mileage must be a number." };
  }

  await createInsuranceProfile({
    label,
    ageBand,
    region,
    licenceYears,
    annualMileageKm,
    notes: notes || null,
  });
  revalidatePath("/admin/insurance");
  return { success: true };
}

export async function deleteProfileAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteInsuranceProfile(id);
  } catch {
    // Restrict FK: profile still has quotes attached. Silently no-op rather
    // than a hard crash — the profile stays listed with its quote count, and
    // the admin can see why it wouldn't go away.
  }
  revalidatePath("/admin/insurance");
}

export async function createQuoteAction(_state: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const variant = String(formData.get("variant") ?? "").trim();
  const modelYear = numberField(formData, "modelYear");
  const bodyStyle = String(formData.get("bodyStyle") ?? "").trim();
  const fuelType = String(formData.get("fuelType") ?? "").trim();
  const transmission = String(formData.get("transmission") ?? "").trim();
  const drivetrain = String(formData.get("drivetrain") ?? "").trim();
  const horsepower = numberField(formData, "horsepower");
  const vehicleValueAmount = numberField(formData, "vehicleValueAmount");
  const registrationNumber = String(formData.get("registrationNumber") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();
  const insurer = String(formData.get("insurer") ?? "").trim();
  const coverageLevel = String(formData.get("coverageLevel") ?? "") as InsuranceCoverageLevel;
  const monthlyPremiumAmount = numberField(formData, "monthlyPremiumAmount");
  const observedAtRaw = String(formData.get("observedAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!make || !model) return { error: "Brand and model are required." };
  if (!modelYear) return { error: "Model year is required." };
  if (!bodyStyle || !fuelType || !transmission) {
    return { error: "Body style, fuel type and transmission are required." };
  }
  if (!vehicleValueAmount || vehicleValueAmount <= 0) {
    return { error: "Vehicle value must be a positive number." };
  }
  if (!profileId) return { error: "Pick which profile this quote was requested with." };
  if (!insurer) return { error: "Insurer name is required." };
  if (!["trafik", "halv", "hel"].includes(coverageLevel)) return { error: "Pick a coverage level." };
  if (!monthlyPremiumAmount || monthlyPremiumAmount <= 0) {
    return { error: "Monthly premium must be a positive number." };
  }
  const observedAt = observedAtRaw ? new Date(observedAtRaw) : new Date();
  if (Number.isNaN(observedAt.getTime())) return { error: "Observed date is invalid." };

  await createInsuranceQuote({
    make,
    model,
    variant: variant || null,
    modelYear,
    bodyStyle,
    fuelType,
    transmission,
    drivetrain: drivetrain || null,
    horsepower: horsepower ?? null,
    vehicleValueAmount,
    registrationNumber: registrationNumber || null,
    vehicleId: vehicleId || null,
    profileId,
    insurer,
    coverageLevel,
    monthlyPremiumAmount,
    observedAt,
    notes: notes || null,
  });

  revalidatePath("/admin/insurance");
  return { success: true };
}

export async function deleteQuoteAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteInsuranceQuote(id);
  revalidatePath("/admin/insurance");
}

export async function lookupVehicleByPlateAction(
  registrationNumber: string,
): Promise<VehicleLookupResult | null> {
  await requireAdmin();
  const trimmed = registrationNumber.trim().toUpperCase();
  if (!trimmed) return null;
  return findVehicleByRegistrationNumber(trimmed);
}

export type EstimatePreviewState = {
  error?: string;
  result?: InsuranceEstimate | null;
  checked?: boolean;
};

export async function previewEstimateAction(
  _state: EstimatePreviewState,
  formData: FormData,
): Promise<EstimatePreviewState> {
  await requireAdmin();
  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const bodyStyle = String(formData.get("bodyStyle") ?? "").trim();
  const fuelType = String(formData.get("fuelType") ?? "").trim();
  const drivetrain = String(formData.get("drivetrain") ?? "").trim();
  const horsepower = numberField(formData, "horsepower");
  const vehicleValueAmount = numberField(formData, "vehicleValueAmount");

  if (!make || !model || !bodyStyle || !fuelType || !vehicleValueAmount) {
    return { error: "Fill in brand, model, body style, fuel type and vehicle value." };
  }

  const result = await estimateInsuranceForVehicle({
    make,
    model,
    bodyStyle,
    fuelType,
    drivetrain: drivetrain || null,
    horsepower: horsepower ?? null,
    vehicleValueAmount,
  });

  return { result, checked: true };
}
