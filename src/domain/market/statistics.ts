/**
 * Small, dependency-free linear algebra and least-squares helpers used by the
 * market analysis.
 *
 * These deliberately take *cross-products* (XᵀX, Xᵀy, yᵀy) rather than raw
 * observations: the database computes those sums with a single aggregate scan,
 * so fitting a model over a hundred thousand listings moves ~50 numbers across
 * the wire instead of a hundred thousand rows. See
 * `market-analysis-repository.ts` for the SQL side.
 */

/**
 * Gauss-Jordan inverse with partial pivoting. Returns `undefined` when the
 * matrix is singular to working precision, which callers treat as "not enough
 * independent variation in the data to answer this" rather than an error.
 */
export function invertMatrix(
  matrix: readonly (readonly number[])[],
): number[][] | undefined {
  const size = matrix.length;
  const working = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => (column === index ? 1 : 0)),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(working[row][column]) > Math.abs(working[pivotRow][column])) {
        pivotRow = row;
      }
    }

    const pivot = working[pivotRow][column];
    if (!Number.isFinite(pivot) || Math.abs(pivot) < 1e-12) return undefined;

    [working[column], working[pivotRow]] = [working[pivotRow], working[column]];

    const inversePivot = 1 / working[column][column];
    for (let index = 0; index < size * 2; index += 1) {
      working[column][index] *= inversePivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = working[row][column];
      if (factor === 0) continue;
      for (let index = 0; index < size * 2; index += 1) {
        working[row][index] -= factor * working[column][index];
      }
    }
  }

  return working.map((row) => row.slice(size));
}

export interface CrossProducts {
  /** XᵀX, symmetric, one row/column per term in `terms`. */
  xx: readonly (readonly number[])[];
  /** Xᵀy. */
  xy: readonly number[];
  /** yᵀy. With demeaned inputs this is the within-group total sum of squares. */
  yy: number;
  /** Number of observations that entered the sums. */
  observationCount: number;
  /**
   * Number of groups absorbed by demeaning (make+model cells), each of which
   * costs one degree of freedom. Zero for a plain regression.
   */
  absorbedGroupCount: number;
  terms: readonly string[];
}

export interface RegressionTerm {
  term: string;
  /** Effect on the dependent variable of a one-unit increase in this term. */
  coefficient: number;
  standardError: number;
  /** |coefficient| / standardError. Above ~2 is conventionally "significant". */
  tStatistic: number;
}

export interface RegressionFit {
  terms: readonly RegressionTerm[];
  /**
   * Share of the *within-group* variation explained. With make/model cells
   * absorbed this answers "how much of the price spread inside one model does
   * age and mileage explain", which is the question the page asks.
   */
  rSquared: number;
  observationCount: number;
  degreesOfFreedom: number;
  /** Terms dropped because the filtered data holds them constant. */
  droppedTerms: readonly string[];
}

/**
 * Ordinary least squares from cross-products, with no intercept — inputs are
 * expected to be group-demeaned, which absorbs the intercept along with every
 * group's fixed effect.
 *
 * Terms with no remaining variation are dropped instead of failing: filtering
 * the page to "automatic only" makes the manual dummy constant, and the right
 * answer there is "we cannot estimate a gearbox effect", not a broken chart.
 */
export function fitLeastSquares(input: CrossProducts): RegressionFit | undefined {
  const droppedTerms: string[] = [];
  const keptIndexes: number[] = [];

  // A term whose demeaned sum of squares is a vanishing fraction of the total
  // carries no information; keeping it only makes XᵀX singular.
  const totalVariation = input.xx.reduce(
    (total, row, index) => total + Math.abs(row[index]),
    0,
  );
  const varianceFloor = Math.max(1e-9, totalVariation * 1e-10);

  input.terms.forEach((term, index) => {
    if (input.xx[index][index] > varianceFloor) {
      keptIndexes.push(index);
    } else {
      droppedTerms.push(term);
    }
  });

  if (keptIndexes.length === 0) return undefined;

  const size = keptIndexes.length;
  const xx = keptIndexes.map((row) =>
    keptIndexes.map((column) => input.xx[row][column]),
  );
  const xy = keptIndexes.map((row) => input.xy[row]);

  const inverse = invertMatrix(xx);
  if (!inverse) return undefined;

  const coefficients = inverse.map((row) =>
    row.reduce((total, value, index) => total + value * xy[index], 0),
  );

  const explained = coefficients.reduce(
    (total, coefficient, index) => total + coefficient * xy[index],
    0,
  );
  const residualSumOfSquares = Math.max(0, input.yy - explained);
  const degreesOfFreedom =
    input.observationCount - input.absorbedGroupCount - size;
  if (degreesOfFreedom <= 0) return undefined;

  const residualVariance = residualSumOfSquares / degreesOfFreedom;

  return {
    terms: keptIndexes.map((originalIndex, index) => {
      const variance = residualVariance * inverse[index][index];
      const standardError = variance > 0 ? Math.sqrt(variance) : Number.POSITIVE_INFINITY;
      return {
        term: input.terms[originalIndex],
        coefficient: coefficients[index],
        standardError,
        tStatistic:
          standardError > 0 && Number.isFinite(standardError)
            ? Math.abs(coefficients[index] / standardError)
            : 0,
      };
    }),
    rSquared: input.yy > 0 ? Math.max(0, Math.min(1, explained / input.yy)) : 0,
    observationCount: input.observationCount,
    degreesOfFreedom,
    droppedTerms,
  };
}

/**
 * Converts a coefficient on ln(price) into the percentage price change it
 * implies. For small coefficients this is almost the coefficient itself; the
 * exact form matters once effects reach the tens of percent.
 */
export function logCoefficientToPercent(coefficient: number) {
  return (Math.exp(coefficient) - 1) * 100;
}
