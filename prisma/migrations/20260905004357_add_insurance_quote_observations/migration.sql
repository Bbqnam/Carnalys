-- CreateEnum
CREATE TYPE "InsuranceCoverageLevel" AS ENUM ('trafik', 'halv', 'hel');

-- CreateTable
CREATE TABLE "InsuranceProfile" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL,
    "licenceYears" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "annualMileageKm" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceQuoteObservation" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT,
    "registrationNumber" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT,
    "modelYear" INTEGER NOT NULL,
    "bodyStyle" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "transmission" TEXT NOT NULL,
    "drivetrain" TEXT,
    "horsepower" INTEGER,
    "vehicleValueAmount" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "coverageLevel" "InsuranceCoverageLevel" NOT NULL,
    "monthlyPremiumAmount" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceQuoteObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceQuoteObservation_make_model_idx" ON "InsuranceQuoteObservation"("make", "model");

-- CreateIndex
CREATE INDEX "InsuranceQuoteObservation_vehicleId_idx" ON "InsuranceQuoteObservation"("vehicleId");

-- CreateIndex
CREATE INDEX "InsuranceQuoteObservation_profileId_idx" ON "InsuranceQuoteObservation"("profileId");

-- CreateIndex
CREATE INDEX "InsuranceQuoteObservation_observedAt_idx" ON "InsuranceQuoteObservation"("observedAt");

-- AddForeignKey
ALTER TABLE "InsuranceQuoteObservation" ADD CONSTRAINT "InsuranceQuoteObservation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "VehicleRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceQuoteObservation" ADD CONSTRAINT "InsuranceQuoteObservation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InsuranceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

