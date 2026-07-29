import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent, agentWithPermission } from "@/lib/agency/session";
import { getAgencyBooking } from "@/lib/agency/store";
import { getBooking, listCases, saveCase } from "@/lib/server/store";
import type { SupportCase } from "@/lib/types";

/**
 * Asking for a change to a live booking.
 *
 * Cancel was the only thing an agent could do to a booking that was already
 * confirmed, so every date change and misspelled name became a phone call
 * nobody could trace. This is deliberately a *request* rather than a direct
 * amendment: modifying a supplier order is a different operation with its own
 * price and its own failure modes, and pretending otherwise here would let an
 * agent tell a customer their dates had moved when nothing had happened yet.
 *
 * The request lands in the same support queue an operator already works, with
 * the booking attached, so it is answered rather than lost.
 */
const CHANGE_KINDS = new Set(["dates", "names", "occupancy", "requests", "other"]);

export async function POST(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const guard = await agentWithPermission("booking");
  if ("denied" in guard) {
    const authed = await activeAgent();
    return authed
      ? fail("accountSecurity", "agency.notPermitted", locale, { status: 403 })
      : fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  const session = guard.session;

  const trade = await getAgencyBooking(reference);
  if (!trade || trade.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });
  if (booking.status === "cancelled" || booking.status === "failed") {
    return fail("policyRestriction", "error.policyRestriction", locale, { status: 409, action: "contactSupport" });
  }

  const body = await readJson<{ kind: string; detail: string }>(req);
  if (!body?.kind || !CHANGE_KINDS.has(body.kind) || !body.detail?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { detail: "required" } });
  }

  // One open request per booking. A second is almost always the same agent
  // asking again, and two cases for one change is how a customer gets two
  // different answers.
  const existing = (await listCases()).find(
    (item) => item.bookingReference === reference && item.status !== "resolved" && item.category.startsWith("change:"),
  );
  if (existing) return ok({ case: existing, alreadyOpen: true });

  const now = new Date().toISOString();
  const supportCase: SupportCase = {
    caseId: `SC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    bookingReference: reference,
    category: `change:${body.kind}`,
    channel: "email",
    status: "open",
    slaHours: 8,
    createdAt: now,
    messages: [
      {
        at: now,
        from: "customer",
        body: `${session.agencyName} (${session.name}) requests a change to ${booking.hotelName}: ${sanitize(body.detail, 800)}`,
      },
      {
        at: now,
        from: "agent",
        body:
          locale === "ar"
            ? "استلمنا طلب التعديل. الحجز قائم كما هو حتى نؤكد التغيير مع العقار."
            : "We have the change request. The booking stands as it is until we confirm the change with the property.",
      },
    ],
  };

  await saveCase(supportCase);
  return ok({ case: supportCase, alreadyOpen: false });
}

export const dynamic = "force-dynamic";
