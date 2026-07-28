import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getQuote, saveQuote } from "@/lib/agency/store";
import { withExpiry } from "@/lib/agency/quotes";
import type { AgencyQuote } from "@/lib/agency/types";

/** One quotation. */

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const quote = await getQuote(id);
  if (!quote || quote.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }
  return ok({ quote: withExpiry(quote) });
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

  const body = await readJson<{ status: AgencyQuote["status"] }>(req);
  const next = body?.status;
  // "expired" is a fact about the clock, not a state an agent chooses.
  if (next !== "accepted" && next !== "declined" && next !== "open") {
    return fail("validation", "error.validation", locale, { status: 422 });
  }

  const updated: AgencyQuote = { ...quote, status: next, updatedAt: new Date().toISOString() };
  await saveQuote(updated);
  return ok({ quote: updated });
}
