import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { CITIES } from "@/lib/data/geo/cities";
import { COUNTRIES } from "@/lib/data/geo/countries";
import { EDITORIAL } from "@/lib/data/editorial";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import { getCachedDestinations, listCachedHotelCodes, syncDestinations, syncHotels } from "@/lib/server/hotelbeds/content";
import { isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import { isTourmindEnabled } from "@/lib/server/tourmind/config";
import { syncTourmindCatalogue, tourmindHotels } from "@/lib/server/tourmind/catalogue";

/**
 * What we can actually sell, and where the gaps are.
 *
 * The most common support question that is really a catalogue question is "why
 * did this city return nothing". The answer is almost always one of three
 * things: the city is not in our geography, the demo inventory does not reach
 * it, or the supplier catalogue was never synced for that country. Those are
 * indistinguishable from an empty results page, so they are separated here.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const [cachedDestinations, tourmindCatalogue] = await Promise.all([
    getCachedDestinations().catch(() => []),
    tourmindHotels().catch(() => []),
  ]);

  const hotelbedsCodes = await listCachedHotelCodes().catch(() => []);
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

  const byCountry = new Map<string, { code: string; name: string; cities: number; demo: number; tourmind: number; editorial: number }>();
  for (const city of CITIES) {
    const country = COUNTRIES.find((c) => c.code === city.countryCode);
    const row =
      byCountry.get(city.countryCode) ??
      { code: city.countryCode, name: country?.name ?? city.countryCode, cities: 0, demo: 0, tourmind: 0, editorial: 0 };
    row.cities += 1;
    row.demo += demoByCity.get(city.slug) ?? 0;
    row.tourmind += tourmindByCity.get(city.slug) ?? 0;
    if (EDITORIAL[city.slug]) row.editorial += 1;
    byCountry.set(city.countryCode, row);
  }

  return ok({
    geography: {
      countries: COUNTRIES.length,
      // Countries we actually hold cities for — the rest are in the table for
      // currency and naming only, and cannot be searched.
      bookableCountries: new Set(CITIES.map((c) => c.countryCode)).size,
      cities: CITIES.length,
      editorialCities: Object.keys(EDITORIAL).length,
      demoProperties: HOTEL_SEEDS.length,
    },
    suppliers: {
      hotelbeds: {
        enabled: isHotelbedsEnabled(),
        destinationsCached: cachedDestinations.length,
        hotelsCached: hotelbedsCodes.length,
      },
      tourmind: {
        enabled: isTourmindEnabled(),
        hotelsMapped: tourmindCatalogue.length,
        citiesCovered: tourmindByCity.size,
      },
    },
    countries: [...byCountry.values()].sort((a, b) => b.cities - a.cities),
  });
}

/**
 * Running a sync from the console.
 *
 * These were CLI-only, which meant a catalogue could only be refreshed by
 * someone with a checkout and credentials on their laptop. Both syncs spend
 * real supplier quota, so each one is audited with what it actually fetched
 * rather than just that it was pressed.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<{ supplier: "hotelbeds" | "tourmind"; destination?: string; countries?: string[] }>(req);

  if (body?.supplier === "hotelbeds") {
    if (!isHotelbedsEnabled()) {
      return fail("policyRestriction", "hotelbeds.missingCredentials", locale, { status: 409, action: "contactSupport" });
    }
    try {
      const lines: string[] = [];
      const log = (message: string) => lines.push(message);
      let saved = 0;
      if (body.destination) {
        saved = await syncHotels(body.destination, { limit: 200, log });
      } else {
        const destinations = await syncDestinations(log);
        saved = destinations.length;
      }
      await appendAudit({
        actor: session.email,
        action: "catalogue.sync",
        subject: `hotelbeds${body.destination ? `:${body.destination}` : ""}`,
        detail: `Synced ${saved} records`,
      });
      return ok({ supplier: "hotelbeds", saved, log: lines.slice(-20) });
    } catch (error) {
      return fail("temporaryService", "error.temporaryService", locale, {
        status: 502,
        retryable: true,
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }

  if (body?.supplier === "tourmind") {
    if (!isTourmindEnabled()) {
      return fail("policyRestriction", "tourmind.missingCredentials", locale, { status: 409, action: "contactSupport" });
    }
    try {
      // Without an explicit list, sync the countries we hold the most cities
      // for: a blind sweep of every country would burn the daily quota on
      // places we cannot sell anyway.
      const busiest = [...new Set(CITIES.map((c) => c.countryCode))]
        .map((code) => ({ code, cities: CITIES.filter((c) => c.countryCode === code).length }))
        .sort((a, b) => b.cities - a.cities)
        .slice(0, 5)
        .map((entry) => entry.code);
      const countries = (body.countries?.length ? body.countries : busiest).map((c) => c.toUpperCase());
      const summary = await syncTourmindCatalogue(countries, { maxPagesPerCountry: 5 });
      await appendAudit({
        actor: session.email,
        action: "catalogue.sync",
        subject: `tourmind:${countries.join(",")}`,
        detail: `Fetched ${summary.fetched}, mapped ${summary.matched}`,
      });
      return ok({ supplier: "tourmind", ...summary });
    } catch (error) {
      return fail("temporaryService", "error.temporaryService", locale, {
        status: 502,
        retryable: true,
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return fail("validation", "error.validation", locale, { status: 422 });
}

export const dynamic = "force-dynamic";
