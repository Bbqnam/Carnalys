import type {
  BuyerScoreComponent,
  BuyerVerdict,
  HistoryConfidence,
  SeasonalAnalysis,
  SeasonalMonth,
} from "./types";

/**
 * One calendar month's raw market observations, as aggregated by the database.
 * `month` is 1-12; when more than one year of history exists, every January is
 * pooled into month 1.
 */
export interface MonthlyMarketObservation {
  month: number;
  observationCount: number;
  listingCount: number;
  medianPrice: number | null;
  /**
   * Mean of ln(asking price) minus the mean ln(asking price) of the listing's
   * own comparison cell. This is the mix-controlled price level — see
   * `summarizeSeasonality` for why a raw monthly median would be misleading.
   */
  meanLogResidual: number | null;
  /** Listings whose asking price was cut during this month. */
  priceReductionCount: number;
  medianListingAgeDays: number | null;
}

export interface SeasonalCoverage {
  /** Distinct year-months with any observation at all. */
  coveredMonthCount: number;
  observationCount: number;
  earliestObservationAt: Date | null;
  latestObservationAt: Date | null;
}

/**
 * A month needs a real cohort behind it before it gets a rating. Below this
 * the page shows the month as observed-but-unrated rather than inventing a
 * verdict from a handful of cars.
 */
const minimumMonthListings = 25;

/** A full year of coverage is the point at which calendar months become comparable. */
const seasonalMonthThreshold = 12;

/**
 * Every rating is relative to the other months in the selection, so a single
 * month would be scored against itself and come out exactly neutral — a
 * verdict that says nothing while looking like it says something. Below two
 * comparable months the page reports what was observed and withholds the
 * rating.
 */
const minimumScorableMonths = 2;

/**
 * How each signal converts into buyer-score points, and how far it is allowed
 * to move the result. The caps matter more than the weights: they stop any one
 * noisy signal (a single month of unusually thin inventory, say) from
 * producing a dramatic verdict on its own.
 */
const scoreWeights = {
  /** Points per percent below the baseline asking-price level. */
  price: { perUnit: 3, cap: 25 },
  /** Points per percentage point of inventory above the annual average. */
  inventory: { perUnit: 0.25, cap: 12 },
  /** Points per percentage point of listings with a price cut. */
  reductions: { perUnit: 1.5, cap: 12 },
  /** Points per day of listing age above the annual average. */
  listingAge: { perUnit: 0.4, cap: 8 },
} as const;

const neutralScore = 50;

function clamp(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}

function verdictFor(score: number): BuyerVerdict {
  if (score >= 68) return "great";
  if (score >= 57) return "good";
  if (score >= 43) return "normal";
  return "expensive";
}

function historyConfidence(
  coveredMonthCount: number,
  observationCount: number,
): HistoryConfidence {
  if (coveredMonthCount >= 24 && observationCount >= 5_000) return "high";
  if (coveredMonthCount >= 12 && observationCount >= 1_500) return "medium";
  if (coveredMonthCount >= 3) return "low";
  return "none";
}

function mean(values: readonly number[]) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Builds the "best time to buy" view from observed history.
 *
 * ## Why not just compare monthly median prices
 *
 * The mix of cars on sale changes through the year, and it changes far more
 * than prices do. A January dominated by older, higher-mileage stock and a May
 * full of nearly-new trade-ins would show May as "expensive" even if every
 * individual car were cheaper in May. So each observation is first expressed
 * relative to its own comparison cell — same make, model, model year band,
 * mileage band, fuel type and seller type — and only those relative figures
 * are averaged per month. What survives is the price level *for a comparable
 * car*, which is the thing a buyer is choosing between months on.
 *
 * ## What the score is, and is not
 *
 * The Buyer Score combines four observable signals: how a comparable car is
 * priced against the annual baseline, how much choice is on the market, how
 * often sellers are cutting prices, and how long stock is sitting. Each is
 * bounded, and each is reported alongside the score so the rating can be
 * checked rather than trusted. It is a readable summary of advertised market
 * conditions, not a precise or predictive instrument — and none of it is
 * transaction data. We observe what sellers ask, when a listing appears, and
 * when it disappears; we never observe a sale.
 */
export function summarizeSeasonality(
  observations: readonly MonthlyMarketObservation[],
  coverage: SeasonalCoverage,
): SeasonalAnalysis {
  const comparable = observations.filter(
    (observation) =>
      observation.listingCount >= minimumMonthListings &&
      observation.meanLogResidual !== null,
  );
  const scorable =
    comparable.length >= minimumScorableMonths ? comparable : [];

  // Every baseline is the selection's own annual average, so a month is only
  // ever called cheap or expensive relative to the rest of its own year.
  const baselineResidual = mean(
    scorable.map((observation) => observation.meanLogResidual!),
  );
  const baselineInventory = mean(
    scorable.map((observation) => observation.listingCount),
  );
  const baselineReductionRate = mean(
    scorable.map(
      (observation) => observation.priceReductionCount / observation.listingCount,
    ),
  );
  const baselineListingAge = mean(
    scorable
      .map((observation) => observation.medianListingAgeDays)
      .filter((value): value is number => value !== null),
  );

  const byMonth = new Map(
    observations.map((observation) => [observation.month, observation]),
  );

  const months: SeasonalMonth[] = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const observation = byMonth.get(month);

    if (!observation) {
      return {
        month,
        observationCount: 0,
        listingCount: 0,
        medianPrice: null,
        relativePricePercent: null,
        inventoryIndex: null,
        priceReductionRate: null,
        medianListingAgeDays: null,
        buyerScore: null,
        verdict: null,
        components: [],
      };
    }

    const reductionRate =
      observation.listingCount > 0
        ? observation.priceReductionCount / observation.listingCount
        : null;
    const inventoryIndex =
      baselineInventory && baselineInventory > 0
        ? (observation.listingCount / baselineInventory) * 100
        : null;

    const isScorable =
      scorable.includes(observation) && baselineResidual !== null;

    // exp() converts the log-scale residual gap back into a plain percentage.
    const relativePricePercent = isScorable
      ? (Math.exp(observation.meanLogResidual! - baselineResidual) - 1) * 100
      : null;

    if (!isScorable || relativePricePercent === null) {
      return {
        month,
        observationCount: observation.observationCount,
        listingCount: observation.listingCount,
        medianPrice: observation.medianPrice,
        relativePricePercent: null,
        inventoryIndex,
        priceReductionRate: reductionRate,
        medianListingAgeDays: observation.medianListingAgeDays,
        buyerScore: null,
        verdict: null,
        components: [],
      };
    }

    const components: BuyerScoreComponent[] = [
      {
        key: "price",
        value: relativePricePercent,
        contribution: clamp(
          -relativePricePercent * scoreWeights.price.perUnit,
          scoreWeights.price.cap,
        ),
      },
    ];

    if (inventoryIndex !== null) {
      components.push({
        key: "inventory",
        value: inventoryIndex,
        contribution: clamp(
          (inventoryIndex - 100) * scoreWeights.inventory.perUnit,
          scoreWeights.inventory.cap,
        ),
      });
    }

    if (reductionRate !== null && baselineReductionRate !== null) {
      components.push({
        key: "reductions",
        value: reductionRate * 100,
        contribution: clamp(
          (reductionRate - baselineReductionRate) *
            100 *
            scoreWeights.reductions.perUnit,
          scoreWeights.reductions.cap,
        ),
      });
    }

    if (observation.medianListingAgeDays !== null && baselineListingAge !== null) {
      components.push({
        key: "listing_age",
        value: observation.medianListingAgeDays,
        contribution: clamp(
          (observation.medianListingAgeDays - baselineListingAge) *
            scoreWeights.listingAge.perUnit,
          scoreWeights.listingAge.cap,
        ),
      });
    }

    const buyerScore = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          neutralScore +
            components.reduce(
              (total, component) => total + component.contribution,
              0,
            ),
        ),
      ),
    );

    return {
      month,
      observationCount: observation.observationCount,
      listingCount: observation.listingCount,
      medianPrice: observation.medianPrice,
      relativePricePercent,
      inventoryIndex,
      priceReductionRate: reductionRate,
      medianListingAgeDays: observation.medianListingAgeDays,
      buyerScore,
      verdict: verdictFor(buyerScore),
      components,
    };
  });

  return {
    months,
    coveredMonthCount: coverage.coveredMonthCount,
    scoredMonthCount: scorable.length,
    observationCount: coverage.observationCount,
    confidence: historyConfidence(
      coverage.coveredMonthCount,
      coverage.observationCount,
    ),
    // Below a full year the same calendar month has never been seen twice, so
    // there is no seasonal pattern to speak of — only a recent trend.
    isSeasonal: coverage.coveredMonthCount >= seasonalMonthThreshold,
    earliestObservationAt: coverage.earliestObservationAt?.toISOString() ?? null,
    latestObservationAt: coverage.latestObservationAt?.toISOString() ?? null,
  };
}
