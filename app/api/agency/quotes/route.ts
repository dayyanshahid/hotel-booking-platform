import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent, agentWithPermission } from "@/lib/agency/session";
import { getAgency, listQuotes, saveQuote } from "@/lib/agency/store";
import { withExpiry } from "@/lib/agency/quotes";
import { viewOffer } from "@/lib/agency/rates";
import { countryForOffer } from "@/lib/agency/context";
import { loadOffer } from "@/lib/server/store";
import { nightsBetween } from "@/lib/format";
import { BOARD_CATALOG, localized } from "@/lib/data/catalog";
import type { AgencyQuote, AgencyQuoteItem } from "@/lib/agency/types";

/**
 * Quotations.
 *
 * The document an agency actually sends. It is built from live offers but does
 * not stay attached to them: each line is snapshotted at the price and policy
 * that stood when it was quoted, so the paper a customer is holding keeps
 * saying what it said. A quote that silently repriced itself when the rate
 * moved would be worse than one that is plainly out of date.
 */

// Validity and the "expiring soon" window are one decision, made in one place.
import { VALID_DAYS } from "@/lib/agency/quotes";

function reference(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let out = "Q-";
  for (let i = 0; i < 3; i++) out += letters[Math.floor(Math.random() * letters.length)];
  out += "-";
  for (let i = 0; i < 3; i++) out += Math.floor(Math.random() * 10);
  return out;
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  const quotes = await listQuotes(session.agencyId);
  return ok({ quotes: quotes.map((quote) => withExpiry(quote)) });
}

interface Body {
  customerName: string;
  customerEmail?: string;
  notes?: string;
  offerIds: string[];
  /**
   * A margin for this quote only, as a percentage on cost.
   *
   * Omitted means the agency's standing rule applies, which is what almost
   * every quote wants. This exists for the ones that do not.
   */
  markupPercent?: number;
}

/**
 * What this quote sells at.
 *
 * The standing rule unless the agent named a margin for this one, and never
 * less than cost either way.
 */
function quoteSell(cost: number, standardSell: number, markupPercent?: number): number {
  if (markupPercent === undefined) return standardSell;
  return Math.max(cost, Math.round(cost * (1 + markupPercent / 100)));
}

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const guard = await agentWithPermission("booking");
  if ("denied" in guard) {
    const authed = await activeAgent();
    return authed
      ? fail("accountSecurity", "agency.notPermitted", locale, { status: 403 })
      : fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  const session = guard.session;

  const body = await readJson<Body>(req);
  /** A per-quote margin, as a percentage on cost. Absent means the usual rule. */
  const markupPercent =
    typeof body?.markupPercent === "number" && Number.isFinite(body.markupPercent)
      ? Math.min(500, Math.max(0, body.markupPercent))
      : undefined;
  if (!body?.customerName?.trim() || !Array.isArray(body.offerIds) || !body.offerIds.length) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { customerName: "required" } });
  }
  if (body.customerEmail && !isEmail(body.customerEmail)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { customerEmail: "invalid" } });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const items: AgencyQuoteItem[] = [];
  for (const offerId of body.offerIds.slice(0, 12)) {
    const offer = await loadOffer(offerId);
    // An offer that has already expired cannot be quoted: the agent would be
    // promising a price we can no longer hold.
    if (!offer) continue;

    const view = viewOffer(offerId, offer.price.total, offer.price.currency, agency, countryForOffer(offer), session.markup);
    const policy = offer.cancellation;
    items.push({
      id: `qi_${Math.random().toString(36).slice(2, 10)}`,
      hotelName: offer.hotelName ?? offer.hotelSlug,
      city: offer.intent.destinationDisplay,
      checkIn: offer.intent.checkIn,
      checkOut: offer.intent.checkOut,
      nights: nightsBetween(offer.intent.checkIn, offer.intent.checkOut),
      roomName: offer.supplierRoomLabel,
      // The stored offer holds a board code; a quote is read by a customer, so
      // it carries the words rather than "BB".
      boardLabel: localized(BOARD_CATALOG[offer.board]?.label, locale) || offer.board,
      rooms: offer.intent.rooms.length,
      // What the money buys, from the price that was quoted — never assumed
      // equal to what the search asked for.
      roomsCovered: Math.max(1, offer.price.roomsCovered ?? 1),
      guests: offer.price.guests,
      cost: view.cost,
      /*
       * The agency's standing markup, unless this quote says otherwise.
       *
       * A margin rule set in settings is the right default and the wrong answer
       * often enough to matter: a repeat corporate client gets sharpened, a
       * one-off booking with work in it gets loaded. Without this an agent
       * either quoted the wrong number or changed the agency-wide rule for one
       * customer and forgot to change it back.
       *
       * Never below cost. An agent can give away all of their margin and no
       * more — a quote that loses money is not a discount, it is a mistake, and
       * the credit line settles at cost regardless of what was charged.
       */
      sell: quoteSell(view.cost, view.sell, markupPercent),
      currency: view.currency,
      cancellation:
        policy.refundable && policy.freeUntil
          ? locale === "ar"
            ? `إلغاء مجاني حتى ${policy.freeUntil.slice(0, 10)}`
            : `Free cancellation until ${policy.freeUntil.slice(0, 10)}`
          : locale === "ar"
            ? "غير قابل للاسترداد"
            : "Non-refundable",
      offerId,
    });
  }

  if (!items.length) {
    return fail("availabilityChanged", "error.availabilityChanged", locale, {
      status: 409,
      action: "selectAlternative",
    });
  }

  const now = new Date();
  const quote: AgencyQuote = {
    id: `qt_${Math.random().toString(36).slice(2, 12)}`,
    reference: reference(),
    agencyId: agency.id,
    agentId: session.agentId,
    agentName: session.name,
    customerName: sanitize(body.customerName, 120),
    customerEmail: body.customerEmail ? sanitize(body.customerEmail, 120).toLowerCase() : undefined,
    notes: sanitize(body.notes, 600),
    items,
    currency: items[0].currency,
    validUntil: new Date(now.getTime() + VALID_DAYS * 86_400_000).toISOString(),
    status: "open",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  await saveQuote(quote);
  return ok({ quote });
}
