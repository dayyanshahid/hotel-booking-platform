import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getQuote, saveQuote } from "@/lib/agency/store";
import { extendedExpiry, withExpiry } from "@/lib/agency/quotes";
import { loadOffer } from "@/lib/server/store";
import type { AgencyQuote } from "@/lib/agency/types";

/** One quotation. */

/**
 * Which of a quote's lines could still be put on the account right now.
 *
 * Resolved on read and never stored. A rate lives about forty-five minutes and
 * a quote is valid for days, so the usual answer is "none" — which is the
 * thing the screen needs to know *before* offering a Book button, rather than
 * after an agent presses one and gets "this option changed or sold out" in
 * front of a customer who has just said yes.
 */
async function withLiveRates(quote: AgencyQuote): Promise<AgencyQuote> {
  const items = await Promise.all(
    quote.items.map(async (item) => ({
      ...item,
      live: item.offerId ? Boolean(await loadOffer(item.offerId)) : false,
    })),
  );
  return { ...quote, items };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const quote = await getQuote(id);
  if (!quote || quote.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }
  return ok({ quote: await withLiveRates(withExpiry(quote)) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const quote = await getQuote(id);
  if (!quote || quote.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const body = await readJson<{ status?: AgencyQuote["status"]; extendDays?: number }>(req);

  /*
   * Two things an agent can change, and one they cannot.
   *
   * Extending is its own request rather than a status: "the customer needs
   * until Friday" is not an answer to the quotation, and folding it into the
   * status field would make re-opening and re-dating the same button.
   */
  if (typeof body?.extendDays === "number") {
    const extended: AgencyQuote = {
      ...quote,
      validUntil: extendedExpiry(body.extendDays),
      /*
       * A lapsed quote comes back open when it is re-dated. Leaving it
       * "expired" beside a date in the future is a badge arguing with the line
       * underneath it, and an agent cannot tell which one to believe.
       */
      status: withExpiry(quote).status === "expired" ? "open" : quote.status,
      updatedAt: new Date().toISOString(),
    };
    await saveQuote(extended);
    return ok({ quote: await withLiveRates(extended) });
  }

  const next = body?.status;
  // "expired" is a fact about the clock, not a state an agent chooses.
  if (next !== "accepted" && next !== "declined" && next !== "open") {
    return fail("validation", "error.validation", locale, { status: 422 });
  }

  const updated: AgencyQuote = { ...quote, status: next, updatedAt: new Date().toISOString() };
  await saveQuote(updated);
  return ok({ quote: await withLiveRates(updated) });
}
