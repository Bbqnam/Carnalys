import { resolveBrandAlias } from "@/domain/vehicle/taxonomy/brand-search";
import { getCatalogModelOptions } from "@/infrastructure/database/catalog-facet-repository";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const requestedMakes = searchParams
      .getAll("make")
      .map((make) => make.trim())
      .filter(Boolean);

    if (requestedMakes.length > 10 || requestedMakes.some((make) => make.length > 80)) {
      return Response.json({ error: "Invalid make filter." }, { status: 400 });
    }

    const makes = [...new Set(
      requestedMakes.map((make) => resolveBrandAlias(make) ?? make),
    )].sort();
    const models = await getCatalogModelOptions(makes);
    return Response.json(
      { models },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=900" } },
    );
  } catch (error) {
    console.error("Failed to load catalog model options", error);
    return Response.json({ error: "Unable to load models." }, { status: 500 });
  }
}
