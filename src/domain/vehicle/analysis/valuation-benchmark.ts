import { valueVehicle } from "./comparable-valuation";
import { recencyDecayFactor, scoreComparable, tierWeight, type SimilarityCandidate } from "./comparable-similarity";

/** Immutable public vehicle facts; identifiers are used only for grouping. */
export interface BenchmarkVehicle extends SimilarityCandidate {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  horsepower: number | null;
  engineDisplacement: number | null;
  mileageKnown: boolean;
  priceAmount: number;
  validationStatus: string;
  valuationEligible: boolean;
  firstSeenAt: Date;
  servedValue: number | null;
  servedMethodology: string | null;
  servedConfidence: number | null;
}

export type BenchmarkMethod = "current-replay" | "strict-median" | "pooled-log-ridge" | "strict-hybrid";
export const benchmarkMethods: BenchmarkMethod[] = ["current-replay", "strict-median", "pooled-log-ridge", "strict-hybrid"];
export type PriceFreeTarget = Omit<BenchmarkVehicle, "priceAmount" | "servedValue" | "servedMethodology" | "servedConfidence">;

export function ordinaryMedian(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}

export function independentPeers(target: PriceFreeTarget, rows: readonly BenchmarkVehicle[]) {
  return rows.filter(row => row.vehicleId !== target.vehicleId && row.id !== target.id);
}

export function strictComparable(target: PriceFreeTarget, row: BenchmarkVehicle) {
  return row.vehicleId !== target.vehicleId && row.make === target.make && row.model === target.model &&
    target.mileageKnown && row.mileageKnown && target.generation != null && row.generation === target.generation &&
    target.bodyStyle !== "other" && row.bodyStyle === target.bodyStyle &&
    target.fuelType !== "other" && row.fuelType === target.fuelType &&
    target.transmission !== "other" && row.transmission === target.transmission &&
    target.drivetrain != null && target.drivetrain !== "other" && row.drivetrain === target.drivetrain &&
    target.powertrainType != null && target.powertrainType !== "unknown" &&
    row.powertrainType === target.powertrainType && row.performanceVariant === target.performanceVariant &&
    target.horsepower != null && row.horsepower != null && Math.abs(row.horsepower - target.horsepower) <= 1 &&
    (target.engineDisplacement == null || row.engineDisplacement === target.engineDisplacement);
}

export function replayCurrentValuation(target: BenchmarkVehicle, rows: readonly BenchmarkVehicle[], now: Date) {
  const peers = independentPeers(target, rows);
  const sameModel = peers.filter(row => row.make === target.make && row.model === target.model)
    .map(row => ({ row, match: scoreComparable(target,
      // Replay the frozen legacy baseline, including its combustion fuel bug.
      // Serving code now rejects a known petrol/diesel mismatch.
      target.powertrainType === "combustion" && row.powertrainType === "combustion" ? { ...row, fuelType: target.fuelType } : row,
      now) })).filter(row => !row.match.hardReject);
  const pool: typeof sameModel = [];
  for (const tier of ["A", "B", "C", "D"] as const) {
    pool.push(...sameModel.filter(row => row.match.tier === tier));
    if (pool.length >= 8) break;
  }
  // Preserve the current circular fallback as baseline behavior so the
  // benchmark exposes it rather than silently giving the baseline a fix.
  const comparables = pool.length >= 3 ? pool.map(({ row, match }) => ({
    priceAmount: row.priceAmount, ageYears: now.getUTCFullYear() - row.modelYear,
    mileageKm: row.mileageKm, weight: tierWeight(match.tier) * recencyDecayFactor(row.observedAt, now),
  })) : peers.filter(row => row.make === target.make && Math.abs(row.modelYear - target.modelYear) <= 5 &&
    row.priceAmount >= target.priceAmount * 0.6 && row.priceAmount <= target.priceAmount * 1.4).map(row => ({
      priceAmount: row.priceAmount, ageYears: now.getUTCFullYear() - row.modelYear,
      mileageKm: row.mileageKm, weight: 0.2 * recencyDecayFactor(row.observedAt, now),
    }));
  return valueVehicle({ ageYears: Math.max(0, now.getUTCFullYear() - target.modelYear), mileageKm: target.mileageKm }, comparables).marketValue;
}

function numbers(row: PriceFreeTarget, now: Date) {
  const age = Math.max(0, now.getUTCFullYear() - row.modelYear);
  return [age, Math.max(0, age - 5), Math.max(0, age - 10), Math.log1p(row.mileageKm),
    row.horsepower == null ? 0 : Math.log(row.horsepower), row.horsepower == null ? 1 : 0];
}
function categories(row: PriceFreeTarget) {
  return ["intercept", `make:${row.make}`, `model:${row.make}:${row.model}`,
    `generation:${row.make}:${row.model}:${row.generation ?? "unknown"}`,
    `body:${row.bodyStyle}`, `fuel:${row.fuelType}`, `power:${row.powertrainType ?? "unknown"}`,
    `transmission:${row.transmission}`, `drive:${row.drivetrain ?? "unknown"}`,
    `trim:${row.trim ?? "unknown"}`, `performance:${row.performanceVariant ?? "unknown"}`, `seller:${row.sellerType}`];
}

export interface RidgeModel {
  predict(row: PriceFreeTarget, asOf?: Date): number | null;
  lambda: number;
  featureCount: number;
}

/** Sparse coordinate-descent ridge; a challenger, never activated by serving code. */
export function trainLogRidge(rows: readonly BenchmarkVehicle[], now: Date, lambda: number): RidgeModel {
  if (!rows.length) throw new Error("Training data is empty");
  const vocabulary = new Map<string, number>();
  const column = (key: string) => {
    if (!vocabulary.has(key)) vocabulary.set(key, vocabulary.size);
    return vocabulary.get(key)!;
  };
  const numeric = rows.map(row => numbers(row, now));
  const means = numeric[0].map((_, j) => numeric.reduce((sum, values) => sum + values[j], 0) / rows.length);
  const scales = means.map((mean, j) => Math.sqrt(numeric.reduce((sum, values) => sum + (values[j] - mean) ** 2, 0) / rows.length) || 1);
  const encoded = rows.map((row, i) => [
    ...categories(row).map(key => [column(key), 1] as const),
    ...numeric[i].map((value, j) => [column(`number:${j}`), (value - means[j]) / scales[j]] as const),
  ]);
  const columns: [number, number][][] = Array.from({ length: vocabulary.size }, () => []);
  encoded.forEach((entries, i) => entries.forEach(([j, value]) => columns[j].push([i, value])));
  const coefficients = new Float64Array(vocabulary.size);
  const residuals = Float64Array.from(rows.map(row => Math.log(row.priceAmount)));
  const norm = columns.map(entries => entries.reduce((sum, [, value]) => sum + value * value, 0));
  for (let pass = 0; pass < 50; pass++) {
    let maximumChange = 0;
    columns.forEach((entries, j) => {
      const previous = coefficients[j];
      const numerator = entries.reduce((sum, [i, value]) => sum + value * (residuals[i] + previous * value), 0);
      const next = numerator / (norm[j] + (j === vocabulary.get("intercept") ? 0 : lambda));
      if (!Number.isFinite(next)) return;
      const change = next - previous;
      coefficients[j] = next;
      for (const [i, value] of entries) residuals[i] -= change * value;
      maximumChange = Math.max(maximumChange, Math.abs(change));
    });
    if (maximumChange < 1e-5) break;
  }
  return { lambda, featureCount: vocabulary.size, predict(row, asOf = now) {
    if (!row.mileageKnown || !vocabulary.has(`model:${row.make}:${row.model}`)) return null;
    let logPrice = 0;
    for (const key of categories(row)) { const j = vocabulary.get(key); if (j != null) logPrice += coefficients[j]; }
    numbers(row, asOf).forEach((value, k) => { const j = vocabulary.get(`number:${k}`); if (j != null) logPrice += coefficients[j] * (value - means[k]) / scales[k]; });
    const price = Math.exp(logPrice);
    return Number.isFinite(price) && price > 0 ? price : null;
  } };
}

export function predictBenchmark(method: BenchmarkMethod, target: BenchmarkVehicle, rows: readonly BenchmarkVehicle[], model: RidgeModel, now: Date) {
  if (method === "current-replay") return replayCurrentValuation(target, rows, now);
  if (!target.mileageKnown) return null;
  if (method === "pooled-log-ridge") return model.predict(target, now);
  const peers = independentPeers(target, rows).filter(row => strictComparable(target, row))
    .sort((a, b) => Math.abs(a.modelYear - target.modelYear) * 60_000 + Math.abs(a.mileageKm - target.mileageKm) -
      (Math.abs(b.modelYear - target.modelYear) * 60_000 + Math.abs(b.mileageKm - target.mileageKm)))
    .slice(0, 40);
  if (peers.length < 3) return null;
  if (method === "strict-median") return ordinaryMedian(peers.map(row => row.priceAmount));
  const targetPrediction = model.predict(target, now);
  if (!targetPrediction) return null;
  // Reject extrapolation; do not hide unsupported adjustments behind a clamp.
  if (target.mileageKm < Math.min(...peers.map(row => row.mileageKm)) || target.mileageKm > Math.max(...peers.map(row => row.mileageKm)) ||
      target.modelYear < Math.min(...peers.map(row => row.modelYear)) || target.modelYear > Math.max(...peers.map(row => row.modelYear))) return null;
  const normalized = peers.flatMap(row => { const prediction = model.predict(row, row.observedAt); return prediction ? [row.priceAmount * targetPrediction / prediction] : []; });
  return normalized.length >= 3 ? ordinaryMedian(normalized) : null;
}

export interface BenchmarkPrediction { vehicleId: string; actual: number; predicted: number | null; stratum: string }
export function summarizePredictions(rows: readonly BenchmarkPrediction[], logRadius: number | null = null) {
  const usable = rows.filter((row): row is BenchmarkPrediction & { predicted: number } => row.predicted != null && row.predicted > 0);
  const absoluteLogs = usable.map(row => Math.abs(Math.log(row.predicted / row.actual))).sort((a, b) => a - b);
  return { targets: rows.length, valued: usable.length, coverage: rows.length ? usable.length / rows.length : 0,
    maeSek: usable.length ? usable.reduce((sum, row) => sum + Math.abs(row.predicted - row.actual), 0) / usable.length : null,
    medianAbsolutePercentageError: ordinaryMedian(usable.map(row => Math.abs(row.predicted / row.actual - 1))),
    meanAbsoluteLogError: usable.length ? absoluteLogs.reduce((sum, value) => sum + value, 0) / usable.length : null,
    medianSignedLogError: ordinaryMedian(usable.map(row => Math.log(row.predicted / row.actual))),
    p95AbsoluteLogError: absoluteLogs.length ? absoluteLogs[Math.ceil(absoluteLogs.length * 0.95) - 1] : null,
    intervalCoverage: logRadius == null || !usable.length ? null : absoluteLogs.filter(error => error <= logRadius).length / usable.length,
    medianIntervalWidthSek: logRadius == null ? null : ordinaryMedian(usable.map(row => row.predicted * (Math.exp(logRadius) - Math.exp(-logRadius)))),
  };
}

export function calibrateLogRadius(rows: readonly BenchmarkPrediction[], nominalCoverage = 0.9) {
  const residuals = rows.flatMap(row => row.predicted != null && row.predicted > 0 ? [Math.abs(Math.log(row.predicted / row.actual))] : []).sort((a, b) => a - b);
  const rank = Math.ceil((residuals.length + 1) * nominalCoverage);
  return rank >= 1 && rank <= residuals.length ? residuals[rank - 1] : null;
}
