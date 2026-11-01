import { getVerifiedSimilarVehicles } from "@/infrastructure/database/similar-vehicle-repository";

export const maxDuration = 30;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^listing_[a-zA-Z0-9_-]{1,100}$/.test(id)) return Response.json({ error: "Invalid listing" }, { status: 400 });
  try {
    return Response.json(await getVerifiedSimilarVehicles(id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Similar vehicle verification failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
    });
    return Response.json({ error: "Availability could not be confirmed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
