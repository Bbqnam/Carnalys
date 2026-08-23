import "server-only";

import { unstable_cache } from "next/cache";
import {
  summarizeSeasonality,
  type MonthlyMarketObservation,
} from "@/domain/market/buyer-score";
import type { CrossProducts } from "@/domain/market/statistics";
import type {
  DepreciationCurve,
  EquipmentValue,
  MarketAnalysis,
  MarketAnalysisFilters,
  MarketSnapshot,
  PriceMileageChart,
  PriceMileagePoint,
  RegionalPrices,
  ValueMap,
  ValueMapBand,
  ValueMapYearGroup,
  VariantValueRanking,
} from "@/domain/market/types";
import {
  deriveValueRelationships,
  valueRelationshipTerms,
} from "@/domain/market/value-relationships";
import { Prisma } from "@/generated/prisma/client";
import { initializeDatabase, prisma } from "./prisma";

/**
 * Every figure on the Analysis page is aggregated inside PostgreSQL. The
 * catalog holds well over a hundred thousand listings, and a filter change
 * that shipped even a fraction of them to the browser would be slower than the
 * analysis is worth. The only query that returns rows rather than aggregates
 * is the scatter plot's sample, which is capped at `scatterSampleLimit`.
 */

/** Enough points to read a relationship; far past this a scatter is just ink. */
const scatterSampleLimit = 1_200;

/**
 * Listings the equipment analysis draws on. Well past the point where a
 * per-option median stops moving, and far enough below the full catalogue to
 * keep the multi-million-row equipment join bounded.
 */
const equipmentSampleLimit = 25_000;

/**
 * Obvious data errors, excluded everywhere. Placeholder prices and impossible
 * odometer readings would otherwise distort medians and, in the regression,
 * pull hard on the fitted line.
 */
const minimumPrice = 3_000;
const maximumPrice = 3_000_000;
const maximumMileageKm = 1_000_000;

/**
 * A price floor that scales with the car's age, applied to every query on this
 * page.
 *
 * A flat floor cannot work here. Around 5% of the catalogue is advertised at a
 * price that is not the price of the car: leasing ads carrying a monthly rate,
 * and "call for price" placeholders listed at 1 SEK. For a current-model-year
 * car those cluster below 10,000 SEK — 4,768 of them — while only 44 genuine
 * listings sit anywhere between 10,000 and 25,000, and the 1st percentile of
 * everything above 10,000 is about 214,000. The junk is not the tail of the
 * real distribution; it is a separate cluster with a wide empty gap above it.
 *
 * The marketplace gives us nothing to identify these directly: `monthlyCost`
 * is null on every row we hold, and the descriptions carry no leasing wording.
 * Age-relative price is the only signal available, and it separates the two
 * clusters cleanly. The floor sits roughly an order of magnitude below the 1st
 * percentile of real listings at every age, so it removes the placeholder
 * cluster without touching genuine cheap cars — an old banger at 4,000 SEK
 * still qualifies, because by then the floor has decayed to the flat minimum.
 *
 * Without this a 1 SEK 2026 XC60 lands in the analysis as a car priced 99.9%
 * below market.
 */
function plausiblePriceCondition(currentYear: number) {
  return Prisma.sql`
    listing."priceAmount" >= GREATEST(
      ${minimumPrice},
      25000 - 2000 * (${currentYear} - vehicle."modelYear")
    )
  `;
}

/** How far back the seasonal reconstruction looks. */
const seasonalWindowMonths = 36;

/** Mileage columns of the value map, in kilometres (1 mil = 10 km). */
const valueMapBands: readonly ValueMapBand[] = [
  { key: "b1", fromKm: 0, toKm: 50_000 },
  { key: "b2", fromKm: 50_000, toKm: 80_000 },
  { key: "b3", fromKm: 80_000, toKm: 120_000 },
  { key: "b4", fromKm: 120_000, toKm: 160_000 },
  { key: "b5", fromKm: 160_000, toKm: null },
];

const valueMapMinimumCellCount = 3;
const valueMapLowConfidenceCount = 8;

function vehicleConditions(filters: MarketAnalysisFilters): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];

  if (filters.brands.length > 0) {
    conditions.push(
      Prisma.sql`vehicle."make" IN (${Prisma.join(filters.brands.map((brand) => Prisma.sql`${brand}`))})`,
    );
  }
  if (filters.models.length > 0) {
    conditions.push(
      Prisma.sql`vehicle."model" IN (${Prisma.join(filters.models.map((model) => Prisma.sql`${model}`))})`,
    );
  }
  if (filters.fuelType) {
    conditions.push(Prisma.sql`vehicle."fuelType" = ${filters.fuelType}`);
  }
  if (filters.transmission) {
    conditions.push(Prisma.sql`vehicle."transmission" = ${filters.transmission}`);
  }
  if (filters.minYear !== null) {
    conditions.push(Prisma.sql`vehicle."modelYear" >= ${filters.minYear}`);
  }
  if (filters.maxYear !== null) {
    conditions.push(Prisma.sql`vehicle."modelYear" <= ${filters.maxYear}`);
  }
  if (filters.minMileageMil !== null) {
    conditions.push(
      Prisma.sql`listing."mileageKm" >= ${filters.minMileageMil * 10}`,
    );
  }
  if (filters.maxMileageMil !== null) {
    conditions.push(
      Prisma.sql`listing."mileageKm" <= ${filters.maxMileageMil * 10}`,
    );
  }

  return conditions;
}

/**
 * The shared FROM/WHERE for the cross-sectional sections (snapshot, scatter,
 * value map, value relationships), which all describe the market *as it stands
 * today* and so look only at live listings.
 */
function activeListingSource(filters: MarketAnalysisFilters) {
  const conditions = [
    Prisma.sql`listing."status" = 'active'`,
    Prisma.sql`listing."priceAmount" <= ${maximumPrice}`,
    plausiblePriceCondition(new Date().getFullYear()),
    Prisma.sql`listing."mileageKm" BETWEEN 0 AND ${maximumMileageKm}`,
    ...vehicleConditions(filters),
  ];

  return Prisma.sql`
    FROM "ListingRecord" AS listing
    INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
    WHERE ${Prisma.join(conditions, " AND ")}
  `;
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every listing's asking price expressed against what a comparable car in the
 * same selection asks — same make, model, model year and 20,000 km mileage
 * band — as a difference in logs.
 *
 * This one fragment is what makes the "premium" figures on this page mean
 * anything. Comparing raw prices between, say, listings with a towbar and
 * listings without would mostly measure that towbars are fitted to bigger,
 * newer estates; comparing residuals measures the towbar. The same reasoning
 * drives the seasonal analysis — see `readSeasonality`.
 *
 * `cellSize` comes back with it so callers can drop cells too small to have a
 * meaningful average.
 */
function residualSource(filters: MarketAnalysisFilters) {
  return Prisma.sql`
    WITH priced AS (
      SELECT
        listing."id" AS "listingId",
        listing."priceAmount" AS "priceAmount",
        listing."municipality" AS "municipality",
        vehicle."make" AS "make",
        vehicle."model" AS "model",
        vehicle."variant" AS "variant",
        vehicle."modelYear" AS "modelYear",
        width_bucket(listing."mileageKm", 0, 400000, 20) AS "mileageBucket",
        LN(listing."priceAmount")::float8 AS "logPrice"
      ${activeListingSource(filters)}
    ),
    -- The cell baseline is a median, not a mean. Marketplace data contains ads
    -- whose "price" is really a monthly leasing rate — a 5,000 SEK XC60 — and a
    -- single one of those drags a mean baseline down far enough to make every
    -- comparison against it meaningless.
    cells AS (
      SELECT
        "make",
        "model",
        "modelYear",
        "mileageBucket",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "logPrice")::float8 AS "cellMedian",
        COUNT(*)::int AS "cellSize"
      FROM priced
      GROUP BY "make", "model", "modelYear", "mileageBucket"
    )
    SELECT
      priced."listingId",
      priced."priceAmount",
      priced."municipality",
      priced."variant",
      priced."modelYear",
      priced."logPrice" - cells."cellMedian" AS "residual",
      cells."cellSize"
    FROM priced
    INNER JOIN cells
      ON cells."make" = priced."make"
     AND cells."model" = priced."model"
     AND cells."modelYear" = priced."modelYear"
     AND cells."mileageBucket" = priced."mileageBucket"
  `;
}

/** Below this a group's residual is noise, not a market signal. */
const minimumGroupSize = 12;

/** Cells smaller than this can't establish a baseline to be measured against. */
const minimumComparisonCell = 4;

/**
 * Listings further than this from their cell's median — under 40% or over 250%
 * of it — are dropped from every comparison on this page.
 *
 * At that distance a listing is not a differently-specified version of the same
 * car; it is a leasing rate, a placeholder, a parts car, or a mis-parse. The
 * global price sanity floor cannot catch these, because 5,000 SEK is perfectly
 * plausible for an old hatchback and nonsense for a three-year-old XC60 — only
 * the comparison with its own cell reveals it.
 */
const residualTrim = Math.log(2.5);

interface VariantRow {
  variant: string | null;
  listingCount: number;
  medianPrice: number | null;
  valuePercent: number | null;
  medianMileageKm: number | null;
  medianModelYear: number | null;
}

/**
 * Ranks the actual versions of a car — "B4 AWD Momentum", "T8 Recharge
 * Inscription" — by how their asking prices compare with what their age and
 * mileage predict. A negative figure means the version asks less than
 * comparable cars of the same model year and mileage, which is the closest
 * thing the data has to "this trim is the value pick".
 */
async function readVariantValue(
  filters: MarketAnalysisFilters,
): Promise<VariantValueRanking> {
  const rows = await prisma.$queryRaw<VariantRow[]>(Prisma.sql`
    WITH scored AS (${residualSource(filters)})
    SELECT
      "variant",
      COUNT(*)::int AS "listingCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceAmount")::float8 AS "medianPrice",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "modelYear")::float8 AS "medianModelYear",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual")::float8 AS "valuePercent"
    FROM scored
    WHERE "cellSize" >= ${minimumComparisonCell}
      AND ABS("residual") <= ${residualTrim}
      AND "variant" IS NOT NULL
      AND LENGTH(BTRIM("variant")) > 0
    GROUP BY "variant"
    HAVING COUNT(*) >= ${minimumGroupSize}
    ORDER BY percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual") ASC
    LIMIT 40
  `);

  return {
    variants: rows.map((row) => ({
      variant: row.variant!,
      listingCount: row.listingCount,
      medianPrice: Math.round(numberOrNull(row.medianPrice) ?? 0),
      medianModelYear: Math.round(numberOrNull(row.medianModelYear) ?? 0),
      // The stored average is a log difference; exp() turns it back into the
      // percentage the reader sees.
      valuePercent: (Math.exp(numberOrNull(row.valuePercent) ?? 0) - 1) * 100,
    })),
    minimumListings: minimumGroupSize,
  };
}

interface DepreciationRow {
  modelYear: number;
  listingCount: number;
  medianPrice: number | null;
}

/**
 * Median asking price by model year, with each year expressed as a share of
 * the newest year present. It is a depreciation curve read off today's market
 * rather than one car followed through time — which is the only kind this data
 * can support, and is how the industry's published curves are built too.
 */
async function readDepreciation(
  filters: MarketAnalysisFilters,
): Promise<DepreciationCurve> {
  const rows = await prisma.$queryRaw<DepreciationRow[]>(Prisma.sql`
    SELECT
      vehicle."modelYear"::int AS "modelYear",
      COUNT(*)::int AS "listingCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY listing."priceAmount")::float8 AS "medianPrice"
    ${activeListingSource(filters)}
    GROUP BY vehicle."modelYear"
    HAVING COUNT(*) >= ${minimumGroupSize}
    ORDER BY vehicle."modelYear"
  `);

  const points = rows.map((row) => ({
    modelYear: row.modelYear,
    listingCount: row.listingCount,
    medianPrice: Math.round(numberOrNull(row.medianPrice) ?? 0),
    retainedPercent: 0,
  }));

  const newest = points.at(-1);
  if (newest && newest.medianPrice > 0) {
    for (const point of points) {
      point.retainedPercent = (point.medianPrice / newest.medianPrice) * 100;
    }
  }

  // The steepest single-year drop is where the largest chunk of depreciation
  // gets paid; the model year just below it is the one that has had that drop
  // taken by the first owner.
  //
  // The search is limited to the newest eight model years, and to years with a
  // real cohort behind them. Without both limits it reliably picked something a
  // decade old off the thin end of the curve, where a handful of listings can
  // swing the median by twenty percent — technically the steepest step, and
  // useless as advice.
  const recent = points.slice(-8).filter((point) => point.listingCount >= 20);
  let sweetSpotYear: number | null = null;
  let steepestDrop = 0;
  for (let index = 1; index < recent.length; index += 1) {
    const drop = recent[index].retainedPercent - recent[index - 1].retainedPercent;
    if (drop > steepestDrop) {
      steepestDrop = drop;
      sweetSpotYear = recent[index - 1].modelYear;
    }
  }

  return { points, sweetSpotYear, baselineYear: newest?.modelYear ?? null };
}

interface EquipmentRow {
  label: string;
  listingCount: number;
  premiumPercent: number | null;
}

/**
 * What a given piece of equipment is associated with in asking price, against
 * comparable cars of the same model, year and mileage band.
 *
 * "Associated with" is doing real work in that sentence: equipment is not
 * randomly assigned, so a figure here mixes the option's own value with
 * whatever else tends to be specified alongside it. It is a useful guide to
 * what the market charges, not a price list.
 */
async function readEquipmentValue(
  filters: MarketAnalysisFilters,
): Promise<EquipmentValue> {
  const rows = await prisma.$queryRaw<EquipmentRow[]>(Prisma.sql`
    WITH scored AS (${residualSource(filters)}),
    usable AS (
      SELECT "listingId", "residual" FROM scored
      WHERE "cellSize" >= ${minimumComparisonCell}
        AND ABS("residual") <= ${residualTrim}
      -- The equipment table holds nearly five million rows at about 36 labels
      -- per listing, so an unfiltered selection joins several million rows to
      -- group by a hundred thousand distinct labels — by far the most
      -- expensive query on the page. Medians per label are estimated perfectly
      -- well from a large sample, so the join is bounded here. The ordering is
      -- the same deterministic hash the scatter uses, so the sample is stable
      -- between renders rather than reshuffling on every load.
      ORDER BY md5("listingId")
      LIMIT ${equipmentSampleLimit}
    ),
    -- One pass over the equipment join. Listings documenting no equipment fall
    -- out naturally by not matching — they were previously excluded by a
    -- separate EXISTS subquery, which meant scanning the whole table twice.
    -- Excluding them matters: sparse ads skew cheap for reasons that have
    -- nothing to do with options, and would inflate every premium on the list.
    joined AS (
      SELECT
        usable."listingId" AS "listingId",
        usable."residual" AS "residual",
        equipment."label" AS "label"
      FROM usable
      INNER JOIN "ListingEquipmentRecord" AS equipment
        ON equipment."listingId" = usable."listingId"
    ),
    documented AS (
      SELECT DISTINCT "listingId", "residual" FROM joined
    ),
    totals AS (
      SELECT
        COUNT(*)::int AS "documentedCount",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual")::float8 AS "median"
      FROM documented
    ),
    tallied AS (
      SELECT
        "label",
        COUNT(*)::int AS "listingCount",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual")::float8 AS "median"
      FROM joined
      GROUP BY "label"
    )
    SELECT
      tallied."label",
      tallied."listingCount",
      (tallied."median" - totals."median")::float8 AS "premiumPercent"
    FROM tallied
    CROSS JOIN totals
    -- Only equipment that actually divides the market is informative. Something
    -- present on nearly every car (a first-aid kit) has no comparison group,
    -- and something on a handful is a quirk of how those ads were written
    -- rather than a real option split — both produce confident-looking numbers
    -- about nothing.
    WHERE tallied."listingCount" >= ${minimumGroupSize}
      AND tallied."listingCount" >= totals."documentedCount" * 0.05
      AND tallied."listingCount" <= totals."documentedCount" * 0.85
    ORDER BY ABS(tallied."median" - totals."median") DESC
    LIMIT 10
  `);

  return {
    items: rows.map((row) => ({
      label: row.label,
      listingCount: row.listingCount,
      premiumPercent: (Math.exp(numberOrNull(row.premiumPercent) ?? 0) - 1) * 100,
    })),
    minimumListings: minimumGroupSize,
  };
}

interface RegionRow {
  municipality: string;
  listingCount: number;
  medianPrice: number | null;
  differencePercent: number | null;
}

/**
 * Where the same car is advertised for less. Municipalities are compared on
 * mix-adjusted residuals, not raw medians, so a town that simply happens to
 * list older cars does not masquerade as a bargain.
 */
async function readRegionalPrices(
  filters: MarketAnalysisFilters,
): Promise<RegionalPrices> {
  const rows = await prisma.$queryRaw<RegionRow[]>(Prisma.sql`
    WITH scored AS (${residualSource(filters)}),
    usable AS (
      SELECT * FROM scored
      WHERE "cellSize" >= ${minimumComparisonCell}
        AND ABS("residual") <= ${residualTrim}
        AND "municipality" IS NOT NULL
        AND LENGTH(BTRIM("municipality")) > 0
    ),
    baseline AS (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual")::float8 AS "median"
      FROM usable
    )
    SELECT
      "municipality",
      COUNT(*)::int AS "listingCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceAmount")::float8 AS "medianPrice",
      (
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual")
        - (SELECT "median" FROM baseline)
      )::float8 AS "differencePercent"
    FROM usable
    GROUP BY "municipality"
    HAVING COUNT(*) >= ${minimumGroupSize}
    ORDER BY percentile_cont(0.5) WITHIN GROUP (ORDER BY "residual") ASC
  `);

  const regions = rows.map((row) => ({
    municipality: row.municipality,
    listingCount: row.listingCount,
    medianPrice: Math.round(numberOrNull(row.medianPrice) ?? 0),
    differencePercent:
      (Math.exp(numberOrNull(row.differencePercent) ?? 0) - 1) * 100,
  }));

  return {
    cheapest: regions.slice(0, 5),
    priciest: regions.slice(-5).reverse(),
    regionCount: regions.length,
    minimumListings: minimumGroupSize,
  };
}

interface SnapshotRow {
  listingCount: number;
  medianPrice: number | null;
  priceP25: number | null;
  priceP75: number | null;
  medianMileageKm: number | null;
  medianModelYear: number | null;
  yearFloor: number | null;
  yearCeiling: number | null;
}

async function readSnapshot(filters: MarketAnalysisFilters) {
  const [row] = await prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS "listingCount",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY listing."priceAmount")::float8 AS "medianPrice",
      percentile_cont(0.25) WITHIN GROUP (ORDER BY listing."priceAmount")::float8 AS "priceP25",
      percentile_cont(0.75) WITHIN GROUP (ORDER BY listing."priceAmount")::float8 AS "priceP75",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY listing."mileageKm")::float8 AS "medianMileageKm",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY vehicle."modelYear")::float8 AS "medianModelYear",
      -- The value map's rows are built from the middle 96% of model years, so
      -- one 1974 project car cannot stretch the grid across five decades.
      GREATEST(
        percentile_cont(0.02) WITHIN GROUP (ORDER BY vehicle."modelYear"),
        MIN(vehicle."modelYear")
      )::float8 AS "yearFloor",
      -- Clamped to a model year that exists, so a row is never labelled with a
      -- year no listing in the selection has.
      LEAST(
        percentile_cont(0.98) WITHIN GROUP (ORDER BY vehicle."modelYear"),
        MAX(vehicle."modelYear")
      )::float8 AS "yearCeiling"
    ${activeListingSource(filters)}
  `);

  const snapshot: MarketSnapshot = {
    listingCount: row?.listingCount ?? 0,
    medianPrice: row ? numberOrNull(row.medianPrice) : null,
    medianMileageKm: row ? numberOrNull(row.medianMileageKm) : null,
    medianModelYear: row ? numberOrNull(row.medianModelYear) : null,
    priceP25: row ? numberOrNull(row.priceP25) : null,
    priceP75: row ? numberOrNull(row.priceP75) : null,
  };

  return {
    snapshot,
    yearFloor: row ? numberOrNull(row.yearFloor) : null,
    yearCeiling: row ? numberOrNull(row.yearCeiling) : null,
  };
}

interface ScatterRow {
  listingId: string;
  price: number;
  mileageKm: number;
  modelYear: number;
  make: string;
  model: string;
  variant: string | null;
  sellerType: string;
  municipality: string;
  matchingCount: number;
  keptCount: number;
  priceMinimum: number;
  priceMaximum: number;
  mileageMaximum: number;
}

async function readPriceMileage(
  filters: MarketAnalysisFilters,
): Promise<PriceMileageChart> {
  const rows = await prisma.$queryRaw<ScatterRow[]>(Prisma.sql`
    WITH matched AS (
      SELECT
        listing."id" AS id,
        listing."priceAmount" AS price,
        listing."mileageKm" AS mileage,
        vehicle."modelYear" AS "modelYear"
      ${activeListingSource(filters)}
    ),
    -- Used-car prices are heavily right-skewed, and the more mixed the
    -- selection the longer the tail: across the whole catalogue the 99th
    -- percentile sits near 1.3M SEK, which squashes the median listing into
    -- the bottom sixth of the chart and hides the relationship the section
    -- exists to show. The upper bound is therefore the tighter of the 99th
    -- percentile and Tukey's fence (P75 + 1.5 × IQR): the fence pulls the axis
    -- in hard on a mixed selection and leaves a well-behaved one (a single
    -- model, say) untouched. Whatever falls outside is counted and reported to
    -- the reader rather than silently dropped.
    quartiles AS (
      SELECT
        COUNT(*)::int AS "matchingCount",
        percentile_cont(0.01) WITHIN GROUP (ORDER BY price)::float8 AS "priceMinimum",
        percentile_cont(0.25) WITHIN GROUP (ORDER BY price)::float8 AS "priceQ1",
        percentile_cont(0.75) WITHIN GROUP (ORDER BY price)::float8 AS "priceQ3",
        percentile_cont(0.99) WITHIN GROUP (ORDER BY price)::float8 AS "priceP99",
        percentile_cont(0.25) WITHIN GROUP (ORDER BY mileage)::float8 AS "mileageQ1",
        percentile_cont(0.75) WITHIN GROUP (ORDER BY mileage)::float8 AS "mileageQ3",
        percentile_cont(0.99) WITHIN GROUP (ORDER BY mileage)::float8 AS "mileageP99"
      FROM matched
    ),
    bounds AS (
      SELECT
        "matchingCount",
        "priceMinimum",
        LEAST("priceP99", "priceQ3" + 1.5 * ("priceQ3" - "priceQ1")) AS "priceMaximum",
        LEAST("mileageP99", "mileageQ3" + 1.5 * ("mileageQ3" - "mileageQ1")) AS "mileageMaximum"
      FROM quartiles
    ),
    kept AS (
      SELECT matched.*
      FROM matched, bounds
      WHERE matched.price BETWEEN bounds."priceMinimum" AND bounds."priceMaximum"
        AND matched.mileage <= bounds."mileageMaximum"
    ),
    kept_count AS (SELECT COUNT(*)::int AS "keptCount" FROM kept),
    -- Ordered by a hash of the listing id rather than by random(). The hash is
    -- a stable pseudo-random shuffle, so narrowing a filter keeps every
    -- surviving listing that was already in the sample instead of drawing an
    -- entirely fresh one. That is what lets the chart animate points to their
    -- new positions when a slider moves, rather than flickering to a different
    -- 1,200 cars on every keystroke.
    sampled AS (
      SELECT id, price, mileage, "modelYear"
      FROM kept
      ORDER BY md5(id)
      LIMIT ${scatterSampleLimit}
    )
    SELECT
      sampled.id AS "listingId",
      sampled.price::int AS "price",
      sampled.mileage::int AS "mileageKm",
      sampled."modelYear"::int AS "modelYear",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      vehicle."variant" AS "variant",
      listing."sellerType" AS "sellerType",
      listing."municipality" AS "municipality",
      bounds."matchingCount",
      kept_count."keptCount",
      bounds."priceMinimum",
      bounds."priceMaximum",
      bounds."mileageMaximum"
    FROM sampled
    INNER JOIN "ListingRecord" AS listing ON listing."id" = sampled.id
    INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
    CROSS JOIN bounds
    CROSS JOIN kept_count
  `);

  const first = rows[0];
  const points: PriceMileagePoint[] = rows.map((row) => ({
    listingId: row.listingId,
    price: row.price,
    mileageKm: row.mileageKm,
    modelYear: row.modelYear,
    title: `${row.make} ${row.model}`,
    variant: row.variant ?? undefined,
    sellerType: row.sellerType === "private" ? "private" : "dealer",
    municipality: row.municipality,
  }));

  return {
    points,
    matchingCount: first?.matchingCount ?? 0,
    trimmedCount: first ? first.matchingCount - first.keptCount : 0,
    priceMinimum: first ? Math.floor(numberOrNull(first.priceMinimum) ?? 0) : 0,
    priceMaximum: first ? Math.ceil(numberOrNull(first.priceMaximum) ?? 0) : 0,
    mileageMinimumKm: 0,
    mileageMaximumKm: first
      ? Math.ceil(numberOrNull(first.mileageMaximum) ?? 0)
      : 0,
    sampled: (first?.keptCount ?? 0) > points.length,
  };
}

/**
 * Chooses the value map's rows. Individual model years while the selection
 * spans a readable number of them; equal-width bands once it does not, so a
 * filter-free view stays a grid rather than a forty-row table.
 */
function buildYearGroups(
  yearFloor: number | null,
  yearCeiling: number | null,
): ValueMapYearGroup[] {
  if (yearFloor === null || yearCeiling === null) return [];

  const from = Math.floor(yearFloor);
  const to = Math.ceil(yearCeiling);
  const span = to - from + 1;
  if (span <= 0) return [];

  const maximumRows = 8;
  if (span <= maximumRows) {
    return Array.from({ length: span }, (_, index) => ({
      key: `y${index}`,
      fromYear: to - index,
      toYear: to - index,
    }));
  }

  const width = Math.ceil(span / maximumRows);
  const groups: ValueMapYearGroup[] = [];
  for (let index = 0; index < maximumRows; index += 1) {
    const groupTo = to - index * width;
    const groupFrom = Math.max(from, groupTo - width + 1);
    if (groupTo < from) break;
    groups.push({ key: `y${index}`, fromYear: groupFrom, toYear: groupTo });
  }
  return groups;
}

interface ValueMapRow {
  yearKey: string | null;
  bandKey: string | null;
  medianPrice: number | null;
  listingCount: number;
}

async function readValueMap(
  filters: MarketAnalysisFilters,
  yearGroups: readonly ValueMapYearGroup[],
): Promise<ValueMap> {
  const emptyMap: ValueMap = {
    yearGroups,
    bands: [],
    cells: [],
    lowConfidenceThreshold: valueMapLowConfidenceCount,
    minimumCellCount: valueMapMinimumCellCount,
  };
  if (yearGroups.length === 0) return emptyMap;

  const yearCase = Prisma.sql`CASE ${Prisma.join(
    yearGroups.map(
      (group) =>
        Prisma.sql`WHEN vehicle."modelYear" BETWEEN ${group.fromYear} AND ${group.toYear} THEN ${group.key}`,
    ),
    " ",
  )} END`;

  const bandCase = Prisma.sql`CASE ${Prisma.join(
    valueMapBands.map((band) =>
      band.toKm === null
        ? Prisma.sql`WHEN listing."mileageKm" >= ${band.fromKm} THEN ${band.key}`
        : Prisma.sql`WHEN listing."mileageKm" < ${band.toKm} THEN ${band.key}`,
    ),
    " ",
  )} END`;

  const rows = await prisma.$queryRaw<ValueMapRow[]>(Prisma.sql`
    WITH classified AS (
      SELECT
        ${yearCase} AS "yearKey",
        ${bandCase} AS "bandKey",
        listing."priceAmount" AS "priceAmount"
      ${activeListingSource(filters)}
    )
    SELECT
      "yearKey",
      "bandKey",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceAmount")::float8 AS "medianPrice",
      COUNT(*)::int AS "listingCount"
    FROM classified
    WHERE "yearKey" IS NOT NULL AND "bandKey" IS NOT NULL
    GROUP BY "yearKey", "bandKey"
  `);

  const cells = rows
    .filter((row) => row.yearKey && row.bandKey)
    .map((row) => ({
      yearKey: row.yearKey!,
      bandKey: row.bandKey!,
      medianPrice: Math.round(numberOrNull(row.medianPrice) ?? 0),
      listingCount: row.listingCount,
    }));

  // Mileage bands nobody in this selection falls into are dropped rather than
  // rendered as five empty columns.
  const usedBandKeys = new Set(cells.map((cell) => cell.bandKey));
  const usedYearKeys = new Set(cells.map((cell) => cell.yearKey));

  return {
    yearGroups: yearGroups.filter((group) => usedYearKeys.has(group.key)),
    bands: valueMapBands.filter((band) => usedBandKeys.has(band.key)),
    cells,
    lowConfidenceThreshold: valueMapLowConfidenceCount,
    minimumCellCount: valueMapMinimumCellCount,
  };
}

/**
 * SQL expressions for the regression's design matrix, in the exact order of
 * `valueRelationshipTerms`.
 */
function regressionTermExpressions(currentYear: number): Prisma.Sql[] {
  const dummy = (condition: Prisma.Sql) =>
    Prisma.sql`(CASE WHEN ${condition} THEN 1.0 ELSE 0.0 END)::float8`;

  return [
    Prisma.sql`(${currentYear} - vehicle."modelYear")::float8`,
    // Thousands of mil, so the coefficient reads directly as "per 1,000 mil".
    Prisma.sql`(listing."mileageKm" / 10000.0)::float8`,
    dummy(Prisma.sql`vehicle."transmission" = 'manual'`),
    dummy(Prisma.sql`listing."sellerType" = 'private'`),
    dummy(Prisma.sql`vehicle."fuelType" = 'diesel'`),
    dummy(Prisma.sql`vehicle."fuelType" = 'electric'`),
    dummy(Prisma.sql`vehicle."fuelType" = 'plug_in_hybrid'`),
    dummy(Prisma.sql`vehicle."fuelType" = 'self_charging_hybrid'`),
  ];
}

interface CrossProductRow {
  n: number;
  groups: number;
  yy: number;
  [key: string]: number;
}

/**
 * Fits the value-relationship model without moving the underlying listings
 * anywhere. Each variable is demeaned against its own make+model cell inside
 * the database, and only the resulting sums of squares and cross-products come
 * back — around fifty numbers, whether the selection holds fifty listings or a
 * hundred thousand. See `deriveValueRelationships` for what the model means.
 */
async function readCrossProducts(
  filters: MarketAnalysisFilters,
): Promise<CrossProducts> {
  const currentYear = new Date().getFullYear();
  const expressions = regressionTermExpressions(currentYear);
  const names = valueRelationshipTerms;

  const rawColumns = expressions.map(
    (expression, index) => Prisma.sql`${expression} AS "r_${Prisma.raw(names[index])}"`,
  );
  const centeredColumns = names.map(
    (name) =>
      Prisma.sql`"r_${Prisma.raw(name)}" - AVG("r_${Prisma.raw(name)}") OVER cell AS "c_${Prisma.raw(name)}"`,
  );

  const sums: Prisma.Sql[] = [
    Prisma.sql`SUM("c_y" * "c_y")::float8 AS "yy"`,
  ];
  names.forEach((name) => {
    sums.push(
      Prisma.sql`SUM("c_${Prisma.raw(name)}" * "c_y")::float8 AS "xy_${Prisma.raw(name)}"`,
    );
  });
  names.forEach((rowName, rowIndex) => {
    names.slice(rowIndex).forEach((columnName) => {
      sums.push(
        Prisma.sql`SUM("c_${Prisma.raw(rowName)}" * "c_${Prisma.raw(columnName)}")::float8 AS "xx_${Prisma.raw(rowName)}_${Prisma.raw(columnName)}"`,
      );
    });
  });

  const [row] = await prisma.$queryRaw<CrossProductRow[]>(Prisma.sql`
    WITH base AS (
      SELECT
        vehicle."make" AS "make",
        vehicle."model" AS "model",
        vehicle."modelYear" AS "modelYear",
        width_bucket(listing."mileageKm", 0, 400000, 20) AS "mileageBucket",
        LN(listing."priceAmount")::float8 AS "r_y",
        ${Prisma.join(rawColumns, ", ")}
      ${activeListingSource(filters)}
    ),
    -- Least squares is the most outlier-sensitive thing on this page: error is
    -- squared, so one listing an order of magnitude off its comparables pulls
    -- the fitted line further than a thousand ordinary ones. The age-relative
    -- price floor removes the bulk of the mispriced ads before this point, but
    -- the survivors skew towards newer cars, which is exactly where they would
    -- bias the model-year coefficient — the number the page leads with.
    plausibleCells AS (
      SELECT
        "make",
        "model",
        "modelYear",
        "mileageBucket",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "r_y")::float8 AS "cellMedian"
      FROM base
      GROUP BY "make", "model", "modelYear", "mileageBucket"
      HAVING COUNT(*) >= ${minimumComparisonCell}
    ),
    -- LEFT, so a listing in a cell too small to have a median is kept rather
    -- than discarded: it cannot be judged either way, and dropping it would
    -- quietly thin out rare models.
    trimmed AS (
      SELECT base.*
      FROM base
      LEFT JOIN plausibleCells
        ON plausibleCells."make" = base."make"
       AND plausibleCells."model" = base."model"
       AND plausibleCells."modelYear" = base."modelYear"
       AND plausibleCells."mileageBucket" = base."mileageBucket"
      WHERE plausibleCells."cellMedian" IS NULL
         OR ABS(base."r_y" - plausibleCells."cellMedian") <= ${residualTrim}
    ),
    celled AS (
      SELECT
        "make",
        "model",
        COUNT(*) OVER cell AS "cellSize",
        "r_y" - AVG("r_y") OVER cell AS "c_y",
        ${Prisma.join(centeredColumns, ", ")}
      FROM trimmed
      WINDOW cell AS (PARTITION BY "make", "model")
    ),
    -- A cell of one or two listings contributes almost nothing once its own
    -- mean is subtracted, while still costing a degree of freedom.
    usable AS (SELECT * FROM celled WHERE "cellSize" >= 3)
    SELECT
      COUNT(*)::int AS "n",
      (SELECT COUNT(*)::int FROM (SELECT DISTINCT "make", "model" FROM usable) AS distinct_cells) AS "groups",
      ${Prisma.join(sums, ", ")}
    FROM usable
  `);

  const size = names.length;
  const xx = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  names.forEach((rowName, rowIndex) => {
    names.slice(rowIndex).forEach((columnName, offset) => {
      const value = numberOrNull(row?.[`xx_${rowName}_${columnName}`]) ?? 0;
      xx[rowIndex][rowIndex + offset] = value;
      xx[rowIndex + offset][rowIndex] = value;
    });
  });

  return {
    xx,
    xy: names.map((name) => numberOrNull(row?.[`xy_${name}`]) ?? 0),
    yy: numberOrNull(row?.yy) ?? 0,
    observationCount: row?.n ?? 0,
    absorbedGroupCount: row?.groups ?? 0,
    terms: [...names],
  };
}

interface SeasonalRow {
  month: number;
  observationCount: number;
  listingCount: number;
  medianPrice: number | null;
  meanLogResidual: number | null;
  priceReductionCount: number;
  medianListingAgeDays: number | null;
}

interface CoverageRow {
  coveredMonthCount: number;
  observationCount: number;
  earliest: Date | null;
  latest: Date | null;
}

/**
 * Reconstructs what the market looked like month by month from the
 * append-only observation log.
 *
 * Each observation is treated as valid until the next one for that listing
 * (or until now, for the current state), which turns a sparse change log back
 * into a continuous timeline. A listing counts towards a month if that
 * validity window overlaps it, taking its latest state within the month.
 *
 * Prices are then expressed relative to the mean log price of the listing's
 * own comparison cell — same make, model, model year, 20,000 km mileage band,
 * fuel type and seller type — before anything is averaged per month. Without
 * that step the numbers would mostly measure which cars happened to be for
 * sale, not what they cost; see `summarizeSeasonality`.
 */
async function readSeasonality(filters: MarketAnalysisFilters) {
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - seasonalWindowMonths);
  windowStart.setDate(1);
  windowStart.setHours(0, 0, 0, 0);

  // Deliberately not restricted to active listings: a listing that has since
  // left the marketplace was still part of the market in the months it was
  // live, and dropping it would bias every past month towards slow sellers.
  const cohortConditions = [
    Prisma.sql`listing."priceAmount" <= ${maximumPrice}`,
    plausiblePriceCondition(new Date().getFullYear()),
    Prisma.sql`listing."mileageKm" BETWEEN 0 AND ${maximumMileageKm}`,
    ...vehicleConditions(filters),
  ];
  const cohort = Prisma.sql`
    SELECT
      listing."id" AS "id",
      COALESCE(listing."publishedAt", listing."firstSeenAt") AS "advertisedAt",
      vehicle."make" AS "make",
      vehicle."model" AS "model",
      vehicle."modelYear" AS "modelYear",
      vehicle."fuelType" AS "fuelType"
    FROM "ListingRecord" AS listing
    INNER JOIN "VehicleRecord" AS vehicle ON vehicle."id" = listing."vehicleId"
    WHERE ${Prisma.join(cohortConditions, " AND ")}
  `;

  const [rows, [coverage]] = await Promise.all([
    prisma.$queryRaw<SeasonalRow[]>(Prisma.sql`
      WITH cohort AS (${cohort}),
      intervals AS (
        SELECT
          observation."listingId" AS "listingId",
          observation."observedAt" AS "validFrom",
          COALESCE(
            LEAD(observation."observedAt") OVER (
              PARTITION BY observation."listingId" ORDER BY observation."observedAt"
            ),
            NOW()
          ) AS "validTo",
          observation."priceAmount" AS "priceAmount",
          observation."previousPriceAmount" AS "previousPriceAmount",
          observation."mileageKm" AS "mileageKm",
          observation."sellerType" AS "sellerType",
          observation."status" AS "status",
          observation."kind" AS "kind"
        FROM "ListingObservation" AS observation
        INNER JOIN cohort ON cohort."id" = observation."listingId"
        WHERE observation."observedAt" >= ${windowStart}
      ),
      -- Expand each observation into exactly the months its validity window
      -- covers. Generating the months per interval rather than cross-joining
      -- against a month list matters: the cross-join produced (listings ×
      -- months) candidate rows and threw away over 97% of them, which was the
      -- single most expensive step in this query.
      spread AS (
        SELECT
          month."monthStart" AS "monthStart",
          intervals."listingId" AS "listingId",
          intervals."priceAmount" AS "priceAmount",
          intervals."mileageKm" AS "mileageKm",
          intervals."sellerType" AS "sellerType",
          intervals."validFrom" AS "validFrom"
        FROM intervals
        INNER JOIN LATERAL generate_series(
          GREATEST(
            date_trunc('month', intervals."validFrom"),
            date_trunc('month', ${windowStart}::timestamp)
          ),
          date_trunc('month', intervals."validTo" - INTERVAL '1 microsecond'),
          INTERVAL '1 month'
        ) AS month("monthStart") ON TRUE
        WHERE intervals."status" = 'active'
      ),
      -- A listing can change price twice inside one month; its state for that
      -- month is the last one observed.
      live AS (
        SELECT DISTINCT ON ("monthStart", "listingId")
          "monthStart",
          "listingId",
          "priceAmount",
          "mileageKm",
          "sellerType"
        FROM spread
        ORDER BY "monthStart", "listingId", "validFrom" DESC
      ),
      keyed AS (
        SELECT
          live."monthStart" AS "monthStart",
          live."listingId" AS "listingId",
          live."priceAmount" AS "priceAmount",
          LN(live."priceAmount")::float8 AS "logPrice",
          cohort."make" AS "make",
          cohort."model" AS "model",
          cohort."modelYear" AS "modelYear",
          cohort."fuelType" AS "fuelType",
          live."sellerType" AS "sellerType",
          width_bucket(live."mileageKm", 0, 400000, 20) AS "mileageBucket",
          GREATEST(
            0,
            EXTRACT(
              EPOCH FROM (live."monthStart" + INTERVAL '1 month' - cohort."advertisedAt")
            ) / 86400.0
          )::float8 AS "listingAgeDays"
        FROM live
        INNER JOIN cohort ON cohort."id" = live."listingId"
      ),
      -- Cell baselines are medians, matching the rest of the page. A mean here
      -- let a single mispriced ad move the baseline every comparable listing in
      -- that cell is then measured against.
      --
      -- Only cells large enough to be used downstream are computed. Most cells
      -- hold one or two listings, and an ordered-set aggregate over tens of
      -- thousands of those is pure waste — their residuals are discarded by the
      -- cellSize filter on the aggregate below either way.
      cellMedians AS (
        SELECT
          "make",
          "model",
          "modelYear",
          "mileageBucket",
          "fuelType",
          "sellerType",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY "logPrice")::float8 AS "cellMedian",
          COUNT(*)::int AS "cellSize"
        FROM keyed
        GROUP BY "make", "model", "modelYear", "mileageBucket", "fuelType", "sellerType"
        HAVING COUNT(*) >= 4
      ),
      -- LEFT, so listings in cells too small to have a baseline still count
      -- towards inventory, median price and listing age; only their residual is
      -- absent, which is exactly what the filter downstream expects.
      celled AS (
        SELECT
          keyed."monthStart",
          keyed."listingId",
          keyed."priceAmount",
          keyed."listingAgeDays",
          keyed."logPrice" - cellMedians."cellMedian" AS "residual",
          cellMedians."cellSize"
        FROM keyed
        LEFT JOIN cellMedians
          ON cellMedians."make" = keyed."make"
         AND cellMedians."model" = keyed."model"
         AND cellMedians."modelYear" = keyed."modelYear"
         AND cellMedians."mileageBucket" = keyed."mileageBucket"
         AND cellMedians."fuelType" = keyed."fuelType"
         AND cellMedians."sellerType" = keyed."sellerType"
      ),
      reductions AS (
        SELECT
          EXTRACT(MONTH FROM intervals."validFrom")::int AS "month",
          COUNT(DISTINCT intervals."listingId")::int AS "priceReductionCount"
        FROM intervals
        WHERE intervals."kind" = 'price_change'
          AND intervals."previousPriceAmount" IS NOT NULL
          AND intervals."priceAmount" < intervals."previousPriceAmount"
        GROUP BY 1
      ),
      monthly AS (
        SELECT
          EXTRACT(MONTH FROM celled."monthStart")::int AS "month",
          COUNT(*)::int AS "observationCount",
          COUNT(DISTINCT celled."listingId")::int AS "listingCount",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY celled."priceAmount")::float8 AS "medianPrice",
          AVG(celled."residual") FILTER (
            WHERE celled."cellSize" >= 4 AND ABS(celled."residual") <= ${residualTrim}
          )::float8 AS "meanLogResidual",
          percentile_cont(0.5) WITHIN GROUP (ORDER BY celled."listingAgeDays")::float8 AS "medianListingAgeDays"
        FROM celled
        GROUP BY 1
      )
      SELECT
        monthly."month",
        monthly."observationCount",
        monthly."listingCount",
        monthly."medianPrice",
        monthly."meanLogResidual",
        monthly."medianListingAgeDays",
        COALESCE(reductions."priceReductionCount", 0) AS "priceReductionCount"
      FROM monthly
      LEFT JOIN reductions ON reductions."month" = monthly."month"
      ORDER BY monthly."month"
    `),
    prisma.$queryRaw<CoverageRow[]>(Prisma.sql`
      WITH cohort AS (${cohort})
      SELECT
        COUNT(DISTINCT date_trunc('month', observation."observedAt"))::int AS "coveredMonthCount",
        COUNT(*)::int AS "observationCount",
        MIN(observation."observedAt") AS "earliest",
        MAX(observation."observedAt") AS "latest"
      FROM "ListingObservation" AS observation
      INNER JOIN cohort ON cohort."id" = observation."listingId"
      WHERE observation."observedAt" >= ${windowStart}
    `),
  ]);

  const observations: MonthlyMarketObservation[] = rows.map((row) => ({
    month: row.month,
    observationCount: row.observationCount,
    listingCount: row.listingCount,
    medianPrice:
      row.medianPrice === null ? null : Math.round(numberOrNull(row.medianPrice) ?? 0),
    meanLogResidual: numberOrNull(row.meanLogResidual),
    priceReductionCount: row.priceReductionCount,
    medianListingAgeDays: numberOrNull(row.medianListingAgeDays),
  }));

  return summarizeSeasonality(observations, {
    coveredMonthCount: coverage?.coveredMonthCount ?? 0,
    observationCount: coverage?.observationCount ?? 0,
    earliestObservationAt: coverage?.earliest ?? null,
    latestObservationAt: coverage?.latest ?? null,
  });
}

export const marketAnalysisCacheTag = "market-analysis";

/**
 * Analysis results only move when listings do, and listings only move when a
 * synchronization run writes — nightly, or when someone presses sync. Between
 * those, recomputing a hundred-thousand-listing aggregate because a reader
 * flipped back to a filter combination they looked at a minute ago is pure
 * waste, and the unfiltered view is the most expensive one to rebuild.
 *
 * Filters are the cache key, so each combination is computed at most once per
 * window; `synchronizeLatestListings` invalidates the tag so a manual sync is
 * reflected immediately rather than after the window expires.
 */
export const getCachedMarketAnalysis = unstable_cache(
  (filters: MarketAnalysisFilters) => getMarketAnalysis(filters),
  ["market-analysis"],
  // An hour rather than fifteen minutes, because the underlying data only
  // moves when a synchronization run writes — nightly, or on a manual sync,
  // both of which invalidate the tag explicitly. The window is not what keeps
  // the page correct; the tag is. Widening it only means fewer readers pay for
  // a rebuild, and the unfiltered view is the expensive one to rebuild: about
  // 3.5 seconds against the full catalogue, versus well under a second for any
  // filtered selection.
  { revalidate: 3600, tags: [marketAnalysisCacheTag] },
);

export async function getMarketAnalysis(
  filters: MarketAnalysisFilters,
): Promise<MarketAnalysis> {
  await initializeDatabase();

  // Only the value map depends on another query's result (it needs the model
  // year spread to choose its rows), so everything else is issued immediately
  // rather than waiting behind the snapshot.
  const snapshotPromise = readSnapshot(filters);
  const priceMileagePromise = readPriceMileage(filters);
  const crossProductsPromise = readCrossProducts(filters);
  const seasonalPromise = readSeasonality(filters);
  const variantPromise = readVariantValue(filters);
  const depreciationPromise = readDepreciation(filters);
  const equipmentPromise = readEquipmentValue(filters);
  const regionalPromise = readRegionalPrices(filters);

  const { snapshot, yearFloor, yearCeiling } = await snapshotPromise;
  const yearGroups = buildYearGroups(yearFloor, yearCeiling);

  const [
    priceMileage,
    valueMap,
    crossProducts,
    seasonal,
    variantValue,
    depreciation,
    equipmentValue,
    regionalPrices,
  ] = await Promise.all([
    priceMileagePromise,
    readValueMap(filters, yearGroups),
    crossProductsPromise,
    seasonalPromise,
    variantPromise,
    depreciationPromise,
    equipmentPromise,
    regionalPromise,
  ]);

  return {
    filters,
    snapshot,
    priceMileage,
    valueMap,
    valueRelationships: deriveValueRelationships(
      crossProducts,
      snapshot.medianPrice,
    ),
    variantValue,
    depreciation,
    equipmentValue,
    regionalPrices,
    seasonal,
  };
}
