import {
  fitLeastSquares,
  logCoefficientToPercent,
  type CrossProducts,
  type RegressionFit,
} from "./statistics";
import type { MarketEstimate, ValueRelationships } from "./types";

/**
 * The regressors, in the order the database emits their cross-products.
 * Exported so the SQL builder and the interpretation below cannot drift apart.
 */
export const valueRelationshipTerms = [
  /** Years since the model year. Negative coefficient: older is cheaper. */
  "age",
  /** Odometer reading in thousands of mil (10,000 km). */
  "mileage",
  "manualGearbox",
  "privateSeller",
  "fuelDiesel",
  "fuelElectric",
  "fuelPlugInHybrid",
  "fuelSelfChargingHybrid",
] as const;

export type ValueRelationshipTerm = (typeof valueRelationshipTerms)[number];

/**
 * An estimate is only shown once the data can actually support it. Both gates
 * matter: a large sample with a coefficient indistinguishable from zero is as
 * uninformative as a confident-looking estimate drawn from 20 cars.
 */
const minimumObservations = 60;
const minimumTStatistic = 2;

function estimate(
  fit: RegressionFit,
  term: ValueRelationshipTerm,
  medianPrice: number | null,
  /** Flips the sign so the page can phrase the effect the way a buyer thinks. */
  direction: 1 | -1,
): MarketEstimate | undefined {
  const found = fit.terms.find((candidate) => candidate.term === term);
  if (!found || !Number.isFinite(found.coefficient)) return undefined;
  if (found.tStatistic < minimumTStatistic) return undefined;

  const percent = logCoefficientToPercent(found.coefficient * direction);
  return {
    percent,
    amount: medianPrice === null ? 0 : Math.round((medianPrice * percent) / 100),
    tStatistic: found.tStatistic,
  };
}

/**
 * Turns the fitted model into the handful of numbers the page states.
 *
 * ## Methodology
 *
 * Asking prices are modelled as
 *
 *     ln(price) = α(make, model) + β₁·age + β₂·mileage + β₃·manual
 *                 + β₄·private + Σ β_fuel + ε
 *
 * fitted by least squares after subtracting each make+model cell's own means
 * from every variable. That demeaning step is what makes the answer
 * meaningful: it absorbs α, so β₁ measures how much an extra model year is
 * worth *within a model* rather than picking up the fact that Porsches are
 * newer than Kias. Cells with fewer than three listings are excluded — they
 * contribute nothing after demeaning and only cost degrees of freedom.
 *
 * Working in logs (rather than kronor) means each coefficient is a percentage
 * effect, so one model year is worth proportionally the same on a 90,000 SEK
 * car and a 900,000 SEK one, which matches how depreciation actually behaves.
 * The kronor figures shown to the reader are that percentage applied to the
 * current selection's median asking price.
 *
 * Everything here describes *asking* prices in active listings. We do not
 * observe what anyone paid.
 */
export function deriveValueRelationships(
  crossProducts: CrossProducts,
  medianPrice: number | null,
): ValueRelationships {
  const base = {
    observationCount: crossProducts.observationCount,
    modelCount: crossProducts.absorbedGroupCount,
    medianPrice,
  };

  if (crossProducts.observationCount < minimumObservations) {
    return {
      ...base,
      available: false,
      unavailableReason: "insufficient_data",
      rSquared: 0,
    };
  }

  const fit = fitLeastSquares(crossProducts);
  if (!fit) {
    return {
      ...base,
      available: false,
      unavailableReason: "no_variation",
      rSquared: 0,
    };
  }

  // Buyers think in "newer" and "fewer miles", so both effects are reported
  // in the direction that adds value: one model year *newer*, and 1,000 mil
  // *less* on the odometer. The fitted coefficients run the other way.
  const perModelYear = estimate(fit, "age", medianPrice, -1);
  const perThousandMil = estimate(fit, "mileage", medianPrice, -1);
  const privateSellerGap = estimate(fit, "privateSeller", medianPrice, 1);

  const ageCoefficient = fit.terms.find((term) => term.term === "age");
  const mileageCoefficient = fit.terms.find((term) => term.term === "mileage");
  // How far you can drive before losing what a model year gained you. Only
  // meaningful when both effects point the expected way — a positive mileage
  // coefficient (more miles, higher price) is a sign the selection is too thin
  // or too mixed for the trade-off to mean anything.
  const yearMileageEquivalentMil =
    perModelYear &&
    perThousandMil &&
    ageCoefficient &&
    mileageCoefficient &&
    ageCoefficient.coefficient < 0 &&
    mileageCoefficient.coefficient < 0
      ? Math.round(
          (ageCoefficient.coefficient / mileageCoefficient.coefficient) * 1_000,
        )
      : undefined;

  return {
    ...base,
    available: Boolean(perModelYear || perThousandMil),
    rSquared: fit.rSquared,
    perModelYear,
    perThousandMil,
    privateSellerGap,
    yearMileageEquivalentMil,
  };
}
