import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { CITIES } from "@/lib/data/geo/cities";
import { COUNTRIES } from "@/lib/data/geo/countries";
import { EDITORIAL } from "@/lib/data/editorial";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { getIndex } from "@/lib/server/hotelbeds/content";
import { isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import { tourmindHotels } from "@/lib/server/tourmind/catalogue";

/**
 * Why a city returns nothing, city by city.
 *
 * Coverage reported per country is too coarse to act on: "Portugal has 34 demo
 * properties" does not tell you that Porto has none. This drills to the level
 * an operator can actually do something about, and separates the three causes
 * an empty results page has — the city is not in our geography, no demo
 * inventory reaches it, or the supplier catalogue was never synced for it.
 *
 * A property lookup sits alongside it, because the other half of the question
 * is "is this specific hotel mapped at all", and searching by name is how
 * anyone would ask.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "").toUpperCase();
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const tourmindCatalogue = await tourmindHotels().catch(() => []);

  // A property lookup: is this hotel mapped, and by whom.
  if (query) {
    const index = isHotelbedsEnabled() ? await getIndex().catch(() => null) : null;
    const hotelbeds = Object.entries(index?.bySlug ?? {})
      .filter(([slug]) => slug.toLowerCase().includes(query))
      .slice(0, 15)
      .map(([slug, code]) => ({ slug, code: String(code), source: "hotelbeds" as const, city: "" }));

    const tourmind = tourmindCatalogue
      .filter((record) => record.name.toLowerCase().includes(query))
      .slice(0, 15)
      .map((record) => ({
        slug: `tm-${record.hotelId}`,
        code: String(record.hotelId),
        source: "tourmind" as const,
        city: record.citySlug ?? record.cityName,
      }));

    const demo = HOTEL_SEEDS.filter((seed) => seed.slug.toLowerCase().includes(query))
      .slice(0, 15)
      .map((seed) => ({
        slug: seed.slug,
        code: seed.slug,
        source: "demo" as const,
        city: seed.destinationId.replace(/^dest-/, ""),
      }));

    return ok({ mode: "lookup", matches: [...demo, ...hotelbeds, ...tourmind] });
  }

  // A country drill-down: which of its cities can actually be sold.
  if (country) {
    const tourmindByCity = new Map<string, number>();
    for (const record of tourmindCatalogue) {
      if (!record.citySlug) continue;
      tourmindByCity.set(record.citySlug, (tourmindByCity.get(record.citySlug) ?? 0) + 1);
    }
    const demoByCity = new Map<string, number>();
    for (const seed of HOTEL_SEEDS) {
      const slug = seed.destinationId.replace(/^dest-/, "");
      demoByCity.set(slug, (demoByCity.get(slug) ?? 0) + 1);
    }

    const cities = CITIES.filter((city) => city.countryCode === country).map((city) => ({
      slug: city.slug,
      name: city.name,
      tier: city.tier,
      demo: demoByCity.get(city.slug) ?? 0,
      tourmind: tourmindByCity.get(city.slug) ?? 0,
      editorial: Boolean(EDITORIAL[city.slug]),
    }));

    return ok({
      mode: "country",
      country: COUNTRIES.find((c) => c.code === country)?.name ?? country,
      cities: cities.sort((a, b) => a.demo + a.tourmind - (b.demo + b.tourmind)),
    });
  }

  return fail("validation", "error.validation", locale, { status: 422 });
}
