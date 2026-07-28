import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { runSearch } from "@/lib/server/search";
import { validateIntent } from "@/lib/server/validate";
import { isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import { isTourmindEnabled } from "@/lib/server/tourmind/config";
import { destinationLabel, getDestination } from "@/lib/data/destinations";
import { HOTEL_SEEDS } from "@/lib/data/hotels";
import type { HotelResultCard, SearchFilters, SearchIntent } from "@/lib/types";

/**
 * Search the way a customer would, and then say what happened.
 *
 * The catalogue screen can tell an operator that a city is mapped and how many
 * properties reach it. It cannot answer the call that actually comes in —
 * "a guest says there is nothing in Porto for August" — because the only way to
 * know is to run the search. So this runs the real one, through the same
 * `runSearch` the site uses, and reports both halves: what the guest saw, and
 * the attribution the guest is never shown.
 *
 * Naming suppliers here is deliberate and is the one place it is allowed. The
 * canonical contract keeps supplier identity off consumer and trade responses
 * (§9.4) because neither audience is party to our supply arrangements. An
 * operator is — deciding whether to chase a supplier or fix a mapping is their
 * job, and they cannot do it against an anonymised page.
 *
 * A probe spends real supplier quota, and on evaluation keys that quota is
 * fifty requests a day shared with paying customers. It is audited for exactly
 * that reason: when a search degrades at four in the afternoon, the log should
 * be able to say whether we spent the allowance ourselves.
 */

interface Body {
  intent: Partial<SearchIntent>;
  filters?: SearchFilters;
}

/**
 * Which source a result came from.
 *
 * Live properties carry their origin in the slug the adapters mint, so this
 * needs no extra plumbing through `runSearch` — and nothing about the canonical
 * result has to change to keep the console informed.
 */
function attribute(card: HotelResultCard): "hotelbeds" | "tourmind" | "platform" {
  if (card.slug.startsWith("hb-")) return "hotelbeds";
  if (card.slug.startsWith("tm-")) return "tourmind";
  return "platform";
}

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<Body>(req);
  if (!body?.intent) return fail("validation", "error.validation", locale, { status: 400 });

  const validation = validateIntent(body.intent, locale);
  if (!validation.valid || !validation.intent) {
    return fail("validation", "error.validation", locale, { status: 422, fields: validation.fields });
  }
  const intent = validation.intent;

  const started = Date.now();
  /*
   * A page size well past what any screen shows. The operator's question is
   * "how much is there", and paginating the answer would make them click to
   * find out that the total was the interesting number all along.
   */
  const response = await runSearch(intent, {
    filters: body.filters,
    locale,
    pageSize: 60,
    // The probe is the live path, never a rehearsed one: an operator checking
    // a complaint must not be shown a forced edge case by accident.
    scenario: "normal",
  });
  const elapsedMs = Date.now() - started;

  const bySource = { hotelbeds: 0, tourmind: 0, platform: 0 };
  for (const card of response.results) bySource[attribute(card)] += 1;

  const destination = getDestination(intent.destinationId);
  // What the platform's own inventory holds for this city, which is the
  // difference between "the suppliers were quiet" and "we never had anything".
  const seeded = destination
    ? HOTEL_SEEDS.filter((seed) => seed.destinationId === destination.id).length
    : 0;

  await appendAudit({
    actor: session.email,
    action: "supply.probe",
    subject: intent.destinationId,
    detail: `Probed ${intent.destinationDisplay || intent.destinationId} ${intent.checkIn}→${intent.checkOut}: ${response.totalCount} results in ${elapsedMs}ms`,
  });

  return ok({
    // Exactly what a guest would have been served, so the operator is not
    // reading a second implementation of the search.
    results: response.results,
    totalCount: response.totalCount,
    completeness: response.completeness,
    completenessMessage: response.completenessMessage,
    recovery: response.recovery,
    facets: response.facets,
    intent: response.intent,
    diagnostics: {
      elapsedMs,
      bySource,
      suppliers: {
        // Configured is not the same as answering, and the difference is the
        // first thing to check: an unconfigured supplier contributing nothing
        // is expected, a configured one contributing nothing is a fault.
        hotelbeds: { enabled: isHotelbedsEnabled(), returned: bySource.hotelbeds },
        tourmind: { enabled: isTourmindEnabled(), returned: bySource.tourmind },
      },
      destination: destination
        ? {
            id: destination.id,
            display: destinationLabel(destination, locale),
            city: destination.slug,
            country: destination.countryCode,
            seededProperties: seeded,
          }
        : null,
      // The filters the probe itself applied, so a thin page is not blamed on
      // supply when it was the operator's own ceiling.
      filters: body.filters ?? {},
    },
  });
}

export const dynamic = "force-dynamic";
