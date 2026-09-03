import { createHash } from "node:crypto";
import { MAX_LISTING_IMAGES, type NormalizedVehicleListing } from "@/application/ingestion/types";
import { exactVehicleMatchEvidence } from "@/application/ingestion/vehicle-match-policy";
import { meaningfulListingEvents } from "@/domain/market/listing-history";
import { canonicalizeVehicle } from "@/domain/vehicle/taxonomy";
import { Prisma } from "@/generated/prisma/client";
import { listingImageWritePolicy } from "./listing-image-write-policy";
import { initializeDatabase, prisma } from "./prisma";

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function retainedRawPayload(value: unknown) {
  const mode = process.env.RAW_LISTING_PAYLOAD_RETENTION?.trim().toLowerCase() ?? "full";
  if (mode === "none") return undefined;
  if (mode === "metadata") {
    const importedAt =
      value && typeof value === "object" && "importedAt" in value
        ? (value as { importedAt?: unknown }).importedAt
        : undefined;
    return jsonValue({ importedAt });
  }
  return value === undefined ? undefined : jsonValue(value);
}

function listingHashes(normalized: NormalizedVehicleListing) {
  const equipment = [...new Set(normalized.listing.equipment)].toSorted();
  return {
    contentHash: digest({
      // observedAt describes this fetch, not source content. Hashing it would
      // turn every otherwise unchanged synchronization into a full rewrite.
      source: {
        provider: normalized.source.provider,
        scope: normalized.source.scope,
        externalId: normalized.source.externalId,
        listingUrl: normalized.source.listingUrl,
        publishedAt: normalized.source.publishedAt,
        updatedAt: normalized.source.updatedAt,
      },
      vehicle: normalized.vehicle,
      listing: {
        title: normalized.listing.title,
        sellerName: normalized.listing.sellerName,
        sellerOrganizationNumber: normalized.listing.sellerOrganizationNumber,
        dealerStockNumber: normalized.listing.dealerStockNumber,
        sellerType: normalized.listing.sellerType,
        priceAmount: normalized.listing.priceAmount,
        previousPriceAmount: normalized.listing.previousPriceAmount,
        monthlyCostAmount: normalized.listing.monthlyCostAmount,
        mileageKm: normalized.listing.mileageKm,
        location: normalized.listing.location,
        municipality: normalized.listing.municipality,
        latitude: normalized.listing.latitude,
        longitude: normalized.listing.longitude,
        description: normalized.listing.description,
        serviceHistory: normalized.listing.serviceHistory,
        ownerCount: normalized.listing.ownerCount,
      },
    }),
    imageHash: digest(normalized.listing.images),
    equipmentHash: digest(equipment),
    equipment,
  };
}

/**
 * Resolves a stable vehicleId for every listing in a batch, in one pass.
 *
 * Two listings can be the same physical car (matching VIN or registration
 * number) — e.g. a relisting, or the same car posted more than once. This
 * used to be resolved per-listing, inside each listing's own write
 * transaction: safe when the whole batch ran in one shared transaction
 * (an earlier listing's in-flight insert was visible to a later lookup in
 * the same transaction), but not once listings started writing in their own
 * independent concurrent transactions — two such listings could both check
 * "does this vehicle exist yet?", both see no, and both try to create it,
 * colliding on the registrationNumber/vin unique constraint.
 *
 * Resolving every id upfront removes the race, but naively picking one
 * identifier per listing (VIN if present, else registration number) isn't
 * enough on its own: if listing A has both VIN and regno but listing B (the
 * same car) only has the regno, they'd hash to different keys and still
 * collide. This groups listings that share *either* identifier — VIN or
 * regno, transitively — using union-find, so every listing referring to the
 * same physical car always resolves to the same id, whichever identifiers
 * it happens to report.
 */
async function resolveVehicleIds(
  listings: readonly NormalizedVehicleListing[],
): Promise<{
  vehicleIdByListing: Map<NormalizedVehicleListing, string>;
  mergedVehicleIds: Map<string, string>;
}> {
  const vins = listings
    .map((listing) => listing.vehicle.vin)
    .filter((vin): vin is string => Boolean(vin));
  const registrationNumbers = listings
    .map((listing) => listing.vehicle.registrationNumber)
    .filter((value): value is string => Boolean(value));

  const existingRows =
    vins.length > 0 || registrationNumbers.length > 0
      ? await prisma.vehicleRecord.findMany({
          where: {
            OR: [
              ...(vins.length > 0 ? [{ vin: { in: vins } }] : []),
              ...(registrationNumbers.length > 0
                ? [{ registrationNumber: { in: registrationNumbers } }]
                : []),
            ],
          },
          select: { id: true, vin: true, registrationNumber: true },
        })
      : [];

  const idByIdentifier = new Map<string, string>();
  for (const row of existingRows) {
    if (row.vin) idByIdentifier.set(`vin:${row.vin}`, row.id);
    if (row.registrationNumber) {
      idByIdentifier.set(`regno:${row.registrationNumber}`, row.id);
    }
  }

  const parent = new Map<string, string>();
  function ensure(token: string) {
    if (!parent.has(token)) parent.set(token, token);
  }
  function find(token: string): string {
    let root = token;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = token;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const fallbackTokenByListing = new Map<NormalizedVehicleListing, string>();
  for (const listing of listings) {
    const fallback = `listing:${listing.source.provider}:${listing.source.externalId}`;
    fallbackTokenByListing.set(listing, fallback);
    ensure(fallback);

    const vinToken = listing.vehicle.vin ? `vin:${listing.vehicle.vin}` : undefined;
    const regnoToken = listing.vehicle.registrationNumber
      ? `regno:${listing.vehicle.registrationNumber}`
      : undefined;
    if (vinToken) {
      ensure(vinToken);
      union(fallback, vinToken);
    }
    if (regnoToken) {
      ensure(regnoToken);
      union(fallback, regnoToken);
    }
  }

  // Prefer an existing DB id for the group; otherwise derive a stable id from
  // the group's best-available identifier (VIN over regno over listing key),
  // so a re-run of the same batch (e.g. retrying after a failure) resolves
  // to the same generated id.
  const tokenPriority = (token: string) =>
    token.startsWith("vin:") ? 0 : token.startsWith("regno:") ? 1 : 2;
  const tokensByRoot = new Map<string, string[]>();
  for (const token of parent.keys()) {
    const root = find(token);
    const tokens = tokensByRoot.get(root) ?? [];
    tokens.push(token);
    tokensByRoot.set(root, tokens);
  }

  // A root can span tokens that belonged to two *different*, previously
  // separate VehicleRecord rows (e.g. one row known by VIN, another only by
  // registration number, now linked by a new listing reporting both) — that's
  // a genuine merge, not just a fresh id assignment. Only one canonical id
  // survives per root; every other pre-existing id in that root is recorded
  // here so every listing anywhere in the DB still pointing at it — not just
  // ones in this batch — can be repointed, otherwise the physical car stays
  // permanently split across two vehicle rows.
  const idByRoot = new Map<string, string>();
  const mergedVehicleIds = new Map<string, string>();
  for (const [root, tokens] of tokensByRoot) {
    const existingIdsInRoot = [
      ...new Set(
        tokens
          .map((token) => idByIdentifier.get(token))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const canonicalToken = [...tokens].sort(
      (a, b) => tokenPriority(a) - tokenPriority(b),
    )[0];
    const canonicalId = existingIdsInRoot[0] ?? stableId("vehicle", canonicalToken);
    idByRoot.set(root, canonicalId);
    for (const losingId of existingIdsInRoot.slice(1)) {
      mergedVehicleIds.set(losingId, canonicalId);
    }
  }

  const vehicleIdByListing = new Map<NormalizedVehicleListing, string>();
  for (const listing of listings) {
    const fallback = fallbackTokenByListing.get(listing)!;
    vehicleIdByListing.set(listing, idByRoot.get(find(fallback))!);
  }

  return { vehicleIdByListing, mergedVehicleIds };
}

function neutralAnalysis(priceAmount: number) {
  const roundedThousands = (value: number) =>
    Math.max(1_000, Math.round(value / 1_000) * 1_000);
  return {
    marketValueAmount: priceAmount,
    marketValueMinimum: roundedThousands(priceAmount * 0.9),
    marketValueMaximum: roundedThousands(priceAmount * 1.1),
    comparableCount: 0,
    confidence: "low",
    // Not yet analysed: the price is unrated, not "average". A real analysis
    // follows within the same sync via refreshStoredListingAnalyses.
    dealScore: null,
    buyConfidenceScore: 50,
    annualOwnershipCost: Math.round(34_000 + priceAmount * 0.065),
    methodologyVersion: "stored-neutral-1.0",
  };
}

interface ExistingListingState {
  id: string;
  vehicleId: string;
  status: string;
  priceAmount: number;
  mileageKm: number;
  sellerName: string | null;
  sellerOrganizationNumber: string | null;
  sellerType: string;
  contentHash: string | null;
  imageHash: string | null;
  imageCount: number;
  equipmentHash: string | null;
}

async function writeListing(
  transaction: Prisma.TransactionClient,
  normalized: NormalizedVehicleListing,
  synchronizedAt: Date,
  existing: ExistingListingState | undefined,
  vehicleId: string,
) {
  const hashes = listingHashes(normalized);
  const imagePolicy = listingImageWritePolicy({
    existingImageCount: existing?.imageCount,
    existingImageHash: existing?.imageHash,
    incomingImageCount: normalized.listing.images.length,
    incomingImageHash: hashes.imageHash,
  });
  const listingId =
    existing?.id ??
    stableId(
      "listing",
      `${normalized.source.provider}:${normalized.source.externalId}`,
    );
  const unchanged =
    existing?.status === "active" &&
    existing.contentHash === hashes.contentHash &&
    existing.imageHash === imagePolicy.imageHash &&
    existing.equipmentHash === hashes.equipmentHash;

  if (unchanged) {
    await transaction.listingRecord.update({
      where: { id: listingId },
      data: {
        sourceScope: normalized.source.scope,
        lastSeenAt: synchronizedAt,
        synchronizedAt,
        missingReconciliationCount: 0,
      },
    });
    return { listingId, state: "unchanged" as const };
  }

  const vehicle = normalized.vehicle;
  const listing = normalized.listing;
  const match = exactVehicleMatchEvidence(vehicle);

  // One canonical taxonomy pass for every source: collapse marketplace naming
  // into a consistent make / model family + body / powertrain, deriving
  // generation / trim / performanceVariant only when confident, and keeping the
  // raw source strings for provenance. See src/domain/vehicle/taxonomy.
  const canonical = canonicalizeVehicle({
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant,
    title: listing.title,
    bodyStyle: vehicle.bodyStyle,
    fuelType: vehicle.fuelType,
    modelYear: vehicle.modelYear,
  });

  const vehicleFields = {
    vin: vehicle.vin,
    registrationNumber: vehicle.registrationNumber,
    make: canonical.make,
    model: canonical.model,
    variant: canonical.variant,
    modelYear: vehicle.modelYear,
    registrationYear: vehicle.registrationYear,
    bodyStyle: canonical.bodyStyle,
    fuelType: canonical.fuelType,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    horsepower: vehicle.horsepower,
    engineDescription: vehicle.engineDescription,
    engineDisplacement: vehicle.engineDisplacementCc,
    fuelConsumption: vehicle.fuelConsumption,
    firstRegistration: vehicle.firstRegistration,
    rawMake: canonical.rawMake,
    rawModel: canonical.rawModel,
    generation: canonical.generation,
    trim: canonical.trim,
    performanceVariant: canonical.performanceVariant,
    normalizationVersion: canonical.normalizationVersion,
  };

  // Kept beside the fields it is derived from, so a change to the vehicle's
  // identity or the seller's name updates it in the same statement. Lowercased
  // at write time so the query can use LIKE against the trigram index without
  // ILIKE's case folding.
  const searchText = [
    canonical.make,
    canonical.model,
    canonical.variant,
    // Keep the raw source model too, so a search for "Golf VII" or "Ceed SW"
    // still hits after canonicalization folds them into the family.
    canonical.rawModel !== canonical.model ? canonical.rawModel : null,
    listing.sellerName,
    listing.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // A P2002 collision here (VIN or registration number already held by a
  // different vehicle row) is handled by the caller: Postgres aborts the
  // whole transaction the instant one statement errors, so any retry has to
  // happen in a fresh transaction, not this one — see
  // `clearConflictingVehicleIdentifiers` in `upsertNormalizedListings`.
  await transaction.vehicleRecord.upsert({
    where: { id: vehicleId },
    create: { id: vehicleId, ...vehicleFields },
    update: vehicleFields,
  });

  await transaction.listingRecord.upsert({
    where: {
      provider_externalId: {
        provider: normalized.source.provider,
        externalId: normalized.source.externalId,
      },
    },
    create: {
      id: listingId,
      provider: normalized.source.provider,
      sourceScope: normalized.source.scope,
      externalId: normalized.source.externalId,
      vehicleId,
      title: listing.title,
      listingUrl: normalized.source.listingUrl,
      sellerName: listing.sellerName,
      sellerOrganizationNumber: listing.sellerOrganizationNumber,
      dealerStockNumber: listing.dealerStockNumber,
      sellerType: listing.sellerType,
      priceAmount: listing.priceAmount,
      previousPriceAmount: listing.previousPriceAmount,
      monthlyCostAmount: listing.monthlyCostAmount,
      mileageKm: listing.mileageKm,
      location: listing.location,
      municipality: listing.municipality,
      latitude: listing.latitude,
      longitude: listing.longitude,
      description: listing.description,
      serviceHistory: listing.serviceHistory,
      ownerCount: listing.ownerCount,
      status: "active",
      publishedAt: normalized.source.publishedAt,
      // Recency anchor for `newest` / `posted within`. On insert firstSeenAt
      // is this run, so the fallback is `synchronizedAt`.
      listedAt: normalized.source.publishedAt ?? synchronizedAt,
      sourceUpdatedAt: normalized.source.updatedAt,
      firstSeenAt: synchronizedAt,
      lastSeenAt: synchronizedAt,
      synchronizedAt,
      rawPayload: retainedRawPayload(normalized.rawPayload),
      vehicleMatchMethod: match.method,
      vehicleMatchConfidence: match.confidence,
      searchText,
      contentHash: hashes.contentHash,
      imageHash: imagePolicy.imageHash,
      equipmentHash: hashes.equipmentHash,
    },
    update: {
      sourceScope: normalized.source.scope,
      vehicleId,
      title: listing.title,
      listingUrl: normalized.source.listingUrl,
      sellerName: listing.sellerName,
      sellerOrganizationNumber: listing.sellerOrganizationNumber,
      dealerStockNumber: listing.dealerStockNumber,
      sellerType: listing.sellerType,
      priceAmount: listing.priceAmount,
      previousPriceAmount: listing.previousPriceAmount,
      monthlyCostAmount: listing.monthlyCostAmount,
      mileageKm: listing.mileageKm,
      location: listing.location,
      municipality: listing.municipality,
      latitude: listing.latitude,
      longitude: listing.longitude,
      description: listing.description,
      serviceHistory: listing.serviceHistory,
      ownerCount: listing.ownerCount,
      status: "active",
      publishedAt: normalized.source.publishedAt,
      // Only a real source publish date moves the recency anchor; a listing
      // without one keeps the first-seen instant it was created with.
      ...(normalized.source.publishedAt
        ? { listedAt: normalized.source.publishedAt }
        : {}),
      sourceUpdatedAt: normalized.source.updatedAt,
      lastSeenAt: synchronizedAt,
      synchronizedAt,
      removedAt: null,
      missingReconciliationCount: 0,
      rawPayload: retainedRawPayload(normalized.rawPayload),
      vehicleMatchMethod: match.method,
      vehicleMatchConfidence: match.confidence,
      searchText,
      contentHash: hashes.contentHash,
      imageHash: imagePolicy.imageHash,
      equipmentHash: hashes.equipmentHash,
    },
  });

  if (imagePolicy.shouldReplaceImages) {
    await transaction.listingImageRecord.deleteMany({ where: { listingId } });
    if (listing.images.length > 0) {
      await transaction.listingImageRecord.createMany({
        data: listing.images.map((image) => ({ ...image, listingId })),
      });
    }
  }

  if (!existing || existing.equipmentHash !== hashes.equipmentHash) {
    await transaction.listingEquipmentRecord.deleteMany({ where: { listingId } });
    if (hashes.equipment.length > 0) {
      await transaction.listingEquipmentRecord.createMany({
        data: hashes.equipment.map((label) => ({ listingId, label })),
      });
    }
  }

  const events = meaningfulListingEvents(existing, listing);
  if (events.length > 0) {
    // Same transaction as the listing write, so the log can never claim a
    // state the listing row never reached (or miss one it did). Duplicates
    // are skipped rather than thrown: a retried batch re-runs with the same
    // synchronizedAt, and re-recording an identical observation is a no-op,
    // not a failure worth aborting a page of listings for.
    await transaction.listingObservation.createMany({
      data: events.map((kind) => ({
          listingId,
          provider: normalized.source.provider,
          observedAt: synchronizedAt,
          kind,
          priceAmount: listing.priceAmount,
          previousPriceAmount:
            kind === "price_change"
              ? existing!.priceAmount
              : null,
          mileageKm: listing.mileageKm,
          previousMileageKm:
            kind === "mileage_change" ? existing!.mileageKm : null,
          sellerType: listing.sellerType,
          previousSellerType:
            kind === "seller_change" ? existing!.sellerType : null,
          sellerName: listing.sellerName ?? null,
          previousSellerName:
            kind === "seller_change" ? existing!.sellerName : null,
          sellerOrganizationNumber:
            listing.sellerOrganizationNumber ?? null,
          previousSellerOrganizationNumber:
            kind === "seller_change"
              ? existing!.sellerOrganizationNumber
              : null,
          status: "active",
          provenance: "observed",
        })),
      skipDuplicates: true,
    });
  }

  // Only seed the neutral placeholder for listings that don't have an
  // analysis row yet (skipDuplicates makes this a no-op otherwise). A plain
  // content change (e.g. a spec field newly resolving) must not stomp a
  // listing's real, comparable-based analysis back down to this flat
  // placeholder — refreshStoredListingAnalyses recomputes the real analysis
  // for changedListingIds shortly after, but only up to a per-run cap, so
  // anything beyond that cap would otherwise be left permanently neutral
  // instead of keeping its last known-good analysis.
  await transaction.listingAnalysisRecord.createMany({
    data: [
      {
        listingId,
        ...neutralAnalysis(listing.priceAmount),
        calculatedAt: synchronizedAt,
        sourceSynchronizedAt: synchronizedAt,
      },
    ],
    skipDuplicates: true,
  });

  return { listingId, state: existing ? ("updated" as const) : ("created" as const) };
}

export interface ListingWriteResult {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  changedListingIds: readonly string[];
}

// Each listing's writes (vehicle, listing, images, equipment, analysis — several
// sequential round trips) previously ran inside one shared transaction, one
// listing at a time, so a page of 50 paid its DB round-trip latency 50x over
// with no overlap. Listings are independent of each other, so each now gets
// its own short transaction and a small pool of these runs concurrently —
// same total DB work, but overlapped instead of serialized. If any listing's
// transaction fails, the ones that already committed stay committed (unlike
// the old shared transaction, which rolled back the whole page); the error
// still propagates so the caller's checkpoint doesn't advance, and retrying
// is safe since writes are idempotent (content-hash short-circuited).
// Not independently load-tested against the DB the way the marketplace API's
// concurrency was — kept a few connections under the pool's new max (see
// prisma.ts) so this doesn't starve the process's other concurrent queries
// (checkpoint advancement, facet refresh) of a connection.
const writeConcurrency = 10;

export async function upsertNormalizedListings(
  listings: readonly NormalizedVehicleListing[],
  synchronizedAt: Date,
): Promise<ListingWriteResult> {
  await initializeDatabase();
  if (listings.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      changedListingIds: [],
    };
  }

  const providers = [...new Set(listings.map(({ source }) => source.provider))];
  const externalIds = listings.map(({ source }) => source.externalId);
  const existingRows = await prisma.listingRecord.findMany({
    where: {
      provider: { in: providers },
      externalId: { in: externalIds },
    },
    select: {
      id: true,
      provider: true,
      externalId: true,
      vehicleId: true,
      status: true,
      priceAmount: true,
      mileageKm: true,
      sellerName: true,
      sellerOrganizationNumber: true,
      sellerType: true,
      contentHash: true,
      imageHash: true,
      equipmentHash: true,
      _count: { select: { images: true } },
    },
  });
  const existingBySource = new Map(
    existingRows.map((row) => [
      `${row.provider}:${row.externalId}`,
      { ...row, imageCount: row._count.images },
    ]),
  );
  const { vehicleIdByListing, mergedVehicleIds } = await resolveVehicleIds(listings);

  for (const [losingId, canonicalId] of mergedVehicleIds) {
    await prisma.listingRecord.updateMany({
      where: { vehicleId: losingId },
      data: { vehicleId: canonicalId },
    });
  }

  const touchedVehicleIds = new Set<string>([
    ...vehicleIdByListing.values(),
    ...mergedVehicleIds.values(),
  ]);

  const results: { state: "created" | "updated" | "unchanged"; listingId: string }[] =
    new Array(listings.length);
  let nextIndex = 0;

  const runLane = async () => {
    while (nextIndex < listings.length) {
      const index = nextIndex;
      nextIndex += 1;
      const listing = listings[index];
      const existing = existingBySource.get(
        `${listing.source.provider}:${listing.source.externalId}`,
      );
      const vehicleId = vehicleIdByListing.get(listing)!;
      const run = () =>
        prisma.$transaction(
          (transaction) => writeListing(transaction, listing, synchronizedAt, existing, vehicleId),
          { timeout: 30_000 },
        );

      try {
        results[index] = await run();
      } catch (error) {
        // VIN and registration number are unique, but neither is
        // permanently tied to one physical car: a plate can be reassigned
        // after a car is scrapped or exported, and a VIN can be
        // mistyped-then-corrected by a seller. When that happens, an older
        // vehicle row can still be holding the identifier a *new* car now
        // legitimately reports, and the upsert collides on it. The failed
        // transaction is already rolled back by this point (Postgres aborts
        // it on the first error), so the identifier is cleared in a fresh
        // transaction before retrying once, rather than reusing the dead one.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const vehicle = listing.vehicle;
          if (vehicle.vin) {
            await prisma.vehicleRecord.updateMany({
              where: { vin: vehicle.vin, NOT: { id: vehicleId } },
              data: { vin: null },
            });
          }
          if (vehicle.registrationNumber) {
            await prisma.vehicleRecord.updateMany({
              where: { registrationNumber: vehicle.registrationNumber, NOT: { id: vehicleId } },
              data: { registrationNumber: null },
            });
          }
          results[index] = await run();
        } else {
          throw error;
        }
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(writeConcurrency, listings.length) }, () => runLane()),
  );

  // One representative listing per physical vehicle for the results grid.
  // Runs after the page's listings have all committed so it sees every new
  // sibling; a listing whose vehicle gained or lost a newer-synced sibling
  // this run has its flag corrected here.
  await refreshVehicleRepresentatives([...touchedVehicleIds]);

  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const changedListingIds: string[] = [];
  for (const result of results) {
    if (result.state === "created") createdCount += 1;
    if (result.state === "updated") updatedCount += 1;
    if (result.state === "unchanged") unchangedCount += 1;
    if (result.state !== "unchanged") changedListingIds.push(result.listingId);
  }

  return { createdCount, updatedCount, unchangedCount, changedListingIds };
}

/**
 * Recomputes `isVehicleRepresentative` for the given vehicles in one statement:
 * the most recently synchronized active listing wins (id as tie-breaker, the
 * same rule as `selectRepresentativeListings`), every other listing for that
 * vehicle is cleared. Rows already carrying the correct value are skipped so a
 * steady-state sync writes nothing here. If a vehicle has no active listing
 * left the flags are untouched — search filters those rows out by status, and
 * a relist re-runs this.
 */
export async function refreshVehicleRepresentatives(
  vehicleIds: readonly string[],
  client: Pick<typeof prisma, "$executeRaw"> = prisma,
) {
  if (vehicleIds.length === 0) return;
  await client.$executeRaw`
    UPDATE "ListingRecord" AS l
    SET "isVehicleRepresentative" = (l."id" = w."id")
    FROM (
      SELECT DISTINCT ON (r."vehicleId") r."vehicleId", r."id"
      FROM "ListingRecord" AS r
      WHERE r."vehicleId" IN (${Prisma.join([...vehicleIds])})
        AND r."status" = 'active'
      ORDER BY r."vehicleId", r."synchronizedAt" DESC, r."id" ASC
    ) AS w
    WHERE l."vehicleId" = w."vehicleId"
      AND l."isVehicleRepresentative" <> (l."id" = w."id")
  `;
}

/**
 * Whole-catalogue version of {@link refreshVehicleRepresentatives}. Cheap
 * because the guard means only rows whose flag is actually wrong are written.
 * Run at the end of every sync so a source that only updates *its own*
 * listings (e.g. the Blocket cron) still can't leave a shared vehicle with two
 * representatives after another source touched it.
 */
export async function refreshAllVehicleRepresentatives(
  client: Pick<typeof prisma, "$executeRaw"> = prisma,
) {
  await client.$executeRaw`
    UPDATE "ListingRecord" AS l
    SET "isVehicleRepresentative" = (l."id" = w."id")
    FROM (
      SELECT DISTINCT ON (r."vehicleId") r."vehicleId", r."id"
      FROM "ListingRecord" AS r
      WHERE r."status" = 'active'
      ORDER BY r."vehicleId", r."synchronizedAt" DESC, r."id" ASC
    ) AS w
    WHERE l."vehicleId" = w."vehicleId"
      AND l."status" = 'active'
      AND l."isVehicleRepresentative" <> (l."id" = w."id")
  `;
}

export async function existingListingExternalIds(
  provider: string,
  externalIds: readonly string[],
) {
  if (externalIds.length === 0) return new Set<string>();
  const rows = await prisma.listingRecord.findMany({
    where: { provider, externalId: { in: [...externalIds] } },
    select: { externalId: true },
  });
  return new Set(rows.map(({ externalId }) => externalId));
}

/**
 * Cached raw detail payloads for listings we've already enriched before,
 * keyed by externalId. Lets a sync re-normalize a known, already-enriched
 * listing from its stored raw JSON instead of re-fetching detail over the
 * network for every listing on every page — the network fetch only happens
 * for genuinely new listings, or known ones never successfully enriched.
 */
export async function existingListingDetailPayloads(
  provider: string,
  externalIds: readonly string[],
) {
  if (externalIds.length === 0) return new Map<string, unknown>();
  const rows = await prisma.listingRecord.findMany({
    where: { provider, externalId: { in: [...externalIds] } },
    select: { externalId: true, rawPayload: true },
  });
  const detailByExternalId = new Map<string, unknown>();
  for (const row of rows) {
    const rawPayload = row.rawPayload as { detail?: unknown } | null;
    if (rawPayload?.detail) detailByExternalId.set(row.externalId, rawPayload.detail);
  }
  return detailByExternalId;
}

/** Compact per-listing ingestion cache used by adapters to decide whether a
 * fresh detail request is warranted. It never selects images/equipment or
 * history tables. */
export async function existingListingPayloads(
  provider: string,
  externalIds: readonly string[],
) {
  if (externalIds.length === 0) return new Map<string, unknown>();
  const rows = await prisma.listingRecord.findMany({
    where: { provider, externalId: { in: [...externalIds] } },
    select: {
      externalId: true,
      rawPayload: true,
      images: {
        select: { url: true },
        orderBy: { position: "asc" },
        take: MAX_LISTING_IMAGES,
      },
      equipment: { select: { label: true } },
    },
  });
  return new Map(
    rows.map((row) => {
      const raw =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? row.rawPayload
          : {};
      return [
        row.externalId,
        {
          ...raw,
          cachedImages: row.images.map(({ url }) => url),
          cachedEquipment: row.equipment.map(({ label }) => label),
        },
      ];
    }),
  );
}

export async function markMissingListingsRemovedSafely(
  provider: string,
  sourceScope: string,
  runId: string,
  runStartedAt: Date,
) {
  const removedAt = new Date();
  return prisma.$transaction(async (transaction) => {
    const run = await transaction.importRun.findUniqueOrThrow({
      where: { id: runId },
      select: { cleanupAppliedAt: true, removedCount: true },
    });
    if (run.cleanupAppliedAt) return run.removedCount;

    await transaction.listingRecord.updateMany({
      where: {
        provider,
        sourceScope,
        status: "active",
        lastSeenAt: { lt: runStartedAt },
      },
      data: { missingReconciliationCount: { increment: 1 } },
    });
    // Capture the last state we ever observed *before* flipping the status,
    // so the exit observation carries the price the ad actually left the
    // market at rather than nothing at all.
    const disappearing = await transaction.listingRecord.findMany({
      where: {
        provider,
        sourceScope,
        status: "active",
        lastSeenAt: { lt: runStartedAt },
        missingReconciliationCount: { gte: 2 },
      },
      select: {
        id: true,
        vehicleId: true,
        priceAmount: true,
        previousPriceAmount: true,
        mileageKm: true,
        sellerType: true,
      },
    });
    const result = await transaction.listingRecord.updateMany({
      where: {
        provider,
        sourceScope,
        status: "active",
        lastSeenAt: { lt: runStartedAt },
        missingReconciliationCount: { gte: 2 },
      },
      data: { status: "removed", removedAt },
    });
    // The ad is gone; that is all we know. It may have sold, been withdrawn,
    // expired, or been relisted elsewhere, so this records a disappearance and
    // never a sale — and the row stays in the log permanently even though the
    // listing has left the marketplace.
    if (disappearing.length > 0) {
      await transaction.listingObservation.createMany({
        data: disappearing.map((listing) => ({
          listingId: listing.id,
          provider,
          observedAt: removedAt,
          kind: "disappeared",
          priceAmount: listing.priceAmount,
          previousPriceAmount: listing.previousPriceAmount,
          mileageKm: listing.mileageKm,
          sellerType: listing.sellerType,
          status: "removed",
        })),
        skipDuplicates: true,
      });
    }
    // A removed listing may have been its vehicle's representative — hand the
    // badge to a surviving active sibling (from another source, or none).
    await refreshVehicleRepresentatives(
      [...new Set(disappearing.map((listing) => listing.vehicleId))],
      transaction,
    );

    await transaction.importRun.update({
      where: { id: runId },
      data: {
        cleanupAppliedAt: removedAt,
        removedCount: result.count,
      },
    });
    return result.count;
  });
}
