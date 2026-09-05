import type { InsuranceCoverageLevel as PrismaInsuranceCoverageLevel } from "@/generated/prisma/enums";
import type { InsuranceEstimateTarget, InsuranceQuoteComparable } from "@/domain/insurance";
import { estimateInsuranceRisk, type InsuranceEstimate } from "@/domain/insurance";
import { prisma } from "./prisma";

export interface InsuranceProfileInput {
  label: string;
  ageBand: string;
  licenceYears: number;
  region: string;
  annualMileageKm: number;
  notes?: string | null;
}

export async function listInsuranceProfiles() {
  const profiles = await prisma.insuranceProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { quotes: true } } },
  });
  return profiles.map((p) => ({ ...p, quoteCount: p._count.quotes }));
}

export async function createInsuranceProfile(input: InsuranceProfileInput) {
  return prisma.insuranceProfile.create({
    data: {
      label: input.label,
      ageBand: input.ageBand,
      licenceYears: input.licenceYears,
      region: input.region,
      annualMileageKm: input.annualMileageKm,
      notes: input.notes || null,
    },
  });
}

export async function deleteInsuranceProfile(id: string) {
  // Restrict FK: a profile with quotes throws rather than silently orphaning
  // them. Let the caller decide how to surface that.
  await prisma.insuranceProfile.delete({ where: { id } });
}

export interface InsuranceQuoteInput {
  vehicleId?: string | null;
  registrationNumber?: string | null;
  make: string;
  model: string;
  variant?: string | null;
  modelYear: number;
  bodyStyle: string;
  fuelType: string;
  transmission: string;
  drivetrain?: string | null;
  horsepower?: number | null;
  vehicleValueAmount: number;
  profileId: string;
  insurer: string;
  coverageLevel: PrismaInsuranceCoverageLevel;
  monthlyPremiumAmount: number;
  observedAt: Date;
  notes?: string | null;
}

export async function listInsuranceQuotes() {
  return prisma.insuranceQuoteObservation.findMany({
    orderBy: { observedAt: "desc" },
    include: { profile: { select: { label: true } } },
  });
}

export async function listDistinctInsurers() {
  const rows = await prisma.insuranceQuoteObservation.findMany({
    distinct: ["insurer"],
    select: { insurer: true },
    orderBy: { insurer: "asc" },
  });
  return rows.map((r) => r.insurer);
}

export async function createInsuranceQuote(input: InsuranceQuoteInput) {
  return prisma.insuranceQuoteObservation.create({
    data: {
      vehicleId: input.vehicleId || null,
      registrationNumber: input.registrationNumber || null,
      make: input.make,
      model: input.model,
      variant: input.variant || null,
      modelYear: input.modelYear,
      bodyStyle: input.bodyStyle,
      fuelType: input.fuelType,
      transmission: input.transmission,
      drivetrain: input.drivetrain || null,
      horsepower: input.horsepower ?? null,
      vehicleValueAmount: input.vehicleValueAmount,
      profileId: input.profileId,
      insurer: input.insurer,
      coverageLevel: input.coverageLevel,
      monthlyPremiumAmount: input.monthlyPremiumAmount,
      observedAt: input.observedAt,
      notes: input.notes || null,
    },
  });
}

export async function deleteInsuranceQuote(id: string) {
  await prisma.insuranceQuoteObservation.delete({ where: { id } });
}

export interface VehicleLookupResult {
  vehicleId: string;
  make: string;
  model: string;
  variant: string | null;
  modelYear: number;
  bodyStyle: string;
  fuelType: string;
  transmission: string;
  drivetrain: string | null;
  horsepower: number | null;
  suggestedValueAmount: number | null;
}

/** Prefills a quote form from a registration number already in the catalog. Never touches personnummer or any driver data — only the vehicle side. */
export async function findVehicleByRegistrationNumber(
  registrationNumber: string,
): Promise<VehicleLookupResult | null> {
  const vehicle = await prisma.vehicleRecord.findUnique({
    where: { registrationNumber },
    include: {
      listings: {
        where: { isVehicleRepresentative: true, status: "active" },
        select: { priceAmount: true },
        take: 1,
      },
    },
  });
  if (!vehicle) return null;

  return {
    vehicleId: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant,
    modelYear: vehicle.modelYear,
    bodyStyle: vehicle.bodyStyle,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    horsepower: vehicle.horsepower,
    suggestedValueAmount: vehicle.listings[0]?.priceAmount ?? null,
  };
}

/**
 * Fetches every quote and lets `estimateInsuranceRisk` do the tiering — the
 * broadest tier deliberately compares across brands (similar body/fuel/value,
 * any make), so this can't be narrowed to the target's own make in SQL. Fine
 * at the manually-collected data volumes this is designed for; revisit if the
 * table ever grows past a few thousand rows.
 */
export async function estimateInsuranceForVehicle(
  target: InsuranceEstimateTarget,
): Promise<InsuranceEstimate | null> {
  const rows = await prisma.insuranceQuoteObservation.findMany({
    select: {
      make: true,
      model: true,
      variant: true,
      modelYear: true,
      bodyStyle: true,
      fuelType: true,
      drivetrain: true,
      horsepower: true,
      vehicleValueAmount: true,
      insurer: true,
      monthlyPremiumAmount: true,
    },
  });

  const comparables: InsuranceQuoteComparable[] = rows;
  return estimateInsuranceRisk(target, comparables);
}
