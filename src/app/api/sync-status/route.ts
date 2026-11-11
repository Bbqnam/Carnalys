import { getPublicSynchronizationStatus } from "@/infrastructure/database/synchronization-state-repository";

export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(runId)) {
    return new Response(null, { status: 400 });
  }
  const status = await getPublicSynchronizationStatus(runId);
  return Response.json(status ?? null, {
    status: status ? 200 : 404,
    headers: { "Cache-Control": "no-store" },
  });
}
