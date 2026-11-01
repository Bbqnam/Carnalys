import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  benchmarkMethods, calibrateLogRadius, predictBenchmark, summarizePredictions, trainLogRidge,
  type BenchmarkMethod, type BenchmarkPrediction, type BenchmarkVehicle,
} from "../../src/domain/vehicle/analysis/valuation-benchmark";

interface Snapshot { manifest: { capturedAt: string; sha256: string; rows: number }; vehicles: (BenchmarkVehicle & { sellerCluster: string; physicalIdentityKnown: boolean })[] }
async function readSnapshot(path: string): Promise<Snapshot> {
  const data = JSON.parse(await readFile(path, "utf8")) as Snapshot;
  const hash = createHash("sha256").update(JSON.stringify(data.vehicles)).digest("hex");
  if (hash !== data.manifest.sha256 || data.vehicles.length !== data.manifest.rows) throw new Error("Snapshot integrity mismatch");
  const ids = new Set<string>();
  data.vehicles.forEach(row => {
    if (ids.has(row.vehicleId)) throw new Error("Snapshot contains duplicate physical vehicle IDs");
    ids.add(row.vehicleId);
    row.observedAt = new Date(row.observedAt);
    row.firstSeenAt = new Date(row.firstSeenAt);
  });
  return data;
}
const bucket = (key: string) => Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16) % 100;
const loss = (rows: BenchmarkPrediction[]) => summarizePredictions(rows).meanAbsoluteLogError ?? Infinity;
function pairedDifference(a: BenchmarkPrediction[], b: BenchmarkPrediction[]) {
  const byId = new Map(b.filter(row => row.predicted != null).map(row => [row.vehicleId, row]));
  const deltas = a.flatMap(row => { const other = byId.get(row.vehicleId); return row.predicted && other?.predicted ?
    [Math.abs(Math.log(other.predicted / other.actual)) - Math.abs(Math.log(row.predicted / row.actual))] : []; });
  if (!deltas.length) return { paired: 0, difference: null, bootstrap95: null };
  let seed = 37;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const means = Array.from({ length: 500 }, () => {
    let sum = 0; for (let i = 0; i < deltas.length; i++) sum += deltas[Math.floor(random() * deltas.length)];
    return sum / deltas.length;
  }).sort((x, y) => x - y);
  return { paired: deltas.length, difference: deltas.reduce((sum, x) => sum + x, 0) / deltas.length, bootstrap95: [means[12], means[487]],
    interpretation: "Challenger minus baseline absolute log error; negative is better. Vehicle bootstrap; dealer dependence remains a limitation." };
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find(arg => !arg.startsWith("--"));
  if (!path) throw new Error("Usage: npm run valuation:evaluate -- snapshot.json [--future=snapshot.json] [--split=vehicle|dealer] [--output=report.json]");
  const snapshot = await readSnapshot(path);
  const futurePath = args.find(arg => arg.startsWith("--future="))?.slice(9);
  const future = futurePath ? await readSnapshot(futurePath) : null;
  const trainingDate = new Date(snapshot.manifest.capturedAt);
  const testDate = future ? new Date(future.manifest.capturedAt) : trainingDate;
  if (future && testDate <= trainingDate) throw new Error("Future snapshot must be later than training snapshot");
  const split = args.includes("--split=dealer") ? "dealer" : "vehicle";
  const eligible = (row: Snapshot["vehicles"][number], now: Date) => row.valuationEligible && row.validationStatus !== "unchecked" &&
    row.physicalIdentityKnown && row.priceAmount >= 3000 && row.priceAmount <= 3_000_000 &&
    now.getTime() - row.observedAt.getTime() <= 30 * 86_400_000;
  const population = snapshot.vehicles.filter(row => eligible(row, trainingDate));
  const group = (row: Snapshot["vehicles"][number]) => bucket(split === "dealer" ? row.sellerCluster : row.vehicleId);
  const train = population.filter(row => group(row) < 60 && row.mileageKnown);
  const tuning = population.filter(row => group(row) >= 60 && group(row) < 75);
  const calibration = population.filter(row => group(row) >= 75 && group(row) < 85);
  const originalVehicles = new Set(snapshot.vehicles.map(row => row.vehicleId));
  const test = future ? future.vehicles.filter(row => eligible(row, testDate) && !originalVehicles.has(row.vehicleId)) : population.filter(row => group(row) >= 85);
  if (!train.length || !tuning.length || !calibration.length || !test.length) throw new Error("Insufficient independent train/tuning/calibration/test data");
  console.log(JSON.stringify({ train: train.length, tuning: tuning.length, calibration: calibration.length, test: test.length, split }));
  const candidates = [0.1, 1, 10, 100].map(lambda => {
    const model = trainLogRidge(train, trainingDate, lambda);
    const error = loss(tuning.map(row => ({ vehicleId: row.vehicleId, actual: row.priceAmount, predicted: model.predict(row), stratum: row.make })));
    console.log(JSON.stringify({ lambda, tuningMeanAbsoluteLogError: error }));
    return { model, error };
  }).sort((a, b) => a.error - b.error);
  const model = candidates[0].model;
  const byMake = new Map<string, BenchmarkVehicle[]>();
  const byModel = new Map<string, BenchmarkVehicle[]>();
  for (const row of train) {
    for (const [map, key] of [[byMake, row.make], [byModel, JSON.stringify([row.make, row.model])]] as const) {
      const rows = map.get(key) ?? []; rows.push(row); map.set(key, rows);
    }
  }
  const predict = (method: BenchmarkMethod, rows: BenchmarkVehicle[], now: Date) => rows.map(row => ({
    vehicleId: row.vehicleId, actual: row.priceAmount, stratum: row.make,
    predicted: predictBenchmark(method, row, (method === "current-replay" ? byMake.get(row.make) : byModel.get(JSON.stringify([row.make, row.model]))) ?? [], model, now),
  }));
  const predictions = Object.fromEntries(benchmarkMethods.map(method => [method, predict(method, test, testDate)])) as Record<BenchmarkMethod, BenchmarkPrediction[]>;
  const results = Object.fromEntries(benchmarkMethods.map(method => {
    const calibrationRows = predict(method, calibration, trainingDate);
    const radius = calibrateLogRadius(calibrationRows);
    const rows = predictions[method];
    const slices: Record<string, BenchmarkPrediction[]> = {};
    test.forEach((vehicle, i) => {
      const age = testDate.getUTCFullYear() - vehicle.modelYear;
      for (const key of [`make:${vehicle.make}`, `fuel:${vehicle.fuelType}`, `age:${age <= 3 ? "0-3" : age <= 10 ? "4-10" : "11+"}`,
        `mileage:${vehicle.mileageKnown ? vehicle.mileageKm < 100_000 ? "under100k" : "100k+" : "missing"}`,
        `price:${vehicle.priceAmount < 100_000 ? "under100k" : vehicle.priceAmount < 300_000 ? "100-300k" : "300k+"}`,
        `generation:${vehicle.generation == null ? "missing" : "known"}`]) (slices[key] ??= []).push(rows[i]);
    });
    return [method, { ...summarizePredictions(rows, radius), calibrationTargets: calibrationRows.filter(row => row.predicted != null).length,
      logIntervalRadius: radius, nominalIntervalCoverage: 0.9,
      slices: Object.fromEntries(Object.entries(slices).map(([key, slice]) => [key, summarizePredictions(slice, radius)])),
      pairedAgainstCurrent: pairedDifference(predictions["current-replay"], rows) }];
  }));
  const common = test.filter((_, i) => benchmarkMethods.every(method => predictions[method][i].predicted != null));
  const commonIds = new Set(common.map(row => row.vehicleId));
  const served = test.map(row => ({ vehicleId: row.vehicleId, actual: row.priceAmount, predicted: row.servedValue, stratum: row.make }));
  const report = {
    schema: "valuation-benchmark-report-1", snapshot: snapshot.manifest, future: future?.manifest ?? null,
    implementationSha256: createHash("sha256").update(await readFile(new URL(import.meta.url))).update(
      await readFile(new URL("../../src/domain/vehicle/analysis/valuation-benchmark.ts", import.meta.url)),
    ).update(await readFile(new URL("../../src/domain/vehicle/analysis/comparable-valuation.ts", import.meta.url)))
      .update(await readFile(new URL("../../src/domain/vehicle/analysis/comparable-similarity.ts", import.meta.url))).digest("hex"),
    split, estimand: "advertised-asking-price", exclusions: { rawVehicles: snapshot.vehicles.length, eligiblePopulation: population.length, training: train.length },
    selectedRidge: { lambda: model.lambda, features: model.featureCount, selectedUsing: "tuning-only" },
    results, commonCoverage: Object.fromEntries(benchmarkMethods.map(method => [method, summarizePredictions(predictions[method].filter(row => commonIds.has(row.vehicleId)))])),
    servedMixedMethods: summarizePredictions(served),
    releaseDecision: "NOT_APPROVED", limitations: [
      "Asking-price prediction is not transaction-value accuracy or proof of a bargain",
      future ? "Forward evaluation includes genuinely new physical vehicles" : "Cross-sectional grouped holdout only; a later frozen snapshot is required for forward validation",
      "Current replay evaluates the pricing core and its circular fallback, not all historic scoring or quality-gate versions",
      "Frozen canonical attributes may still contain source errors or unresolved duplicate identities",
      "Calibration is empirical; exchangeability, subgroup coverage and drift are not guaranteed",
      "No production estimator is selected automatically; expert audit, tail-error tolerances and prospective checks remain release requirements",
    ],
  };
  const output = args.find(arg => arg.startsWith("--output="))?.slice(9) ?? `${path}.report-${split}.json`;
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output, selectedRidge: report.selectedRidge, results: Object.fromEntries(Object.entries(results).map(([method, result]) => [method, { ...result, slices: undefined }])) }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; });
