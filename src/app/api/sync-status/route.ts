import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { continueManualCatalogUpdate } from "@/application/ingestion/manual-catalog-update";
import { catalogCountCacheTag } from "@/infrastructure/database/vehicle-listing-repository";
export const maxDuration = 300;
import { getPublicSynchronizationStatus } from "@/infrastructure/database/synchronization-state-repository";

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(runId)) {
    return new Response(null, { status: 400 });
  }
  after(async () => {
    await continueManualCatalogUpdate(runId);
    revalidateTag(catalogCountCacheTag, { expire: 0 });
  });
  const status = await getPublicSynchronizationStatus(runId);
  return Response.json(status ?? null, {
    status: status ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
