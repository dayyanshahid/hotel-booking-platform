import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings, listCases } from "@/lib/server/store";
import { listAgencies, listAgents } from "@/lib/agency/store";

/**
 * One box that finds anything.
 *
 * An operator is handed a reference, an email, or a name, and has no idea which
 * of five screens it belongs to. Making them choose is making them guess. This
 * searches every entity the console can open and returns typed hits, so the
 * answer to "what is NZ-KBJ-5083" is one keystroke rather than a tour.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const query = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (query.length < 2) return ok({ hits: [] });

  const [bookings, agencies] = await Promise.all([listBookings(), listAgencies()]);

  const hits: { type: string; label: string; detail: string; href: string }[] = [];

  for (const booking of bookings) {
    const haystack = `${booking.reference} ${booking.hotelName} ${booking.contact.email} ${booking.guests[0]?.surname ?? ""}`;
    if (!haystack.toLowerCase().includes(query)) continue;
    hits.push({
      type: "booking",
      label: booking.reference,
      detail: `${booking.hotelName} · ${booking.contact.email}`,
      href: `/admin/bookings/${booking.reference}`,
    });
    if (hits.length >= 30) break;
  }

  for (const agency of agencies) {
    if (!`${agency.name} ${agency.slug} ${agency.countryCode}`.toLowerCase().includes(query)) continue;
    hits.push({
      type: "agency",
      label: agency.name,
      detail: `${agency.countryCode} · ${agency.commissionPercent}% commission`,
      href: `/admin/agencies/${agency.id}`,
    });

    for (const agent of await listAgents(agency.id)) {
      if (!`${agent.name} ${agent.email}`.toLowerCase().includes(query)) continue;
      hits.push({ type: "agent", label: agent.name, detail: `${agent.email} · ${agency.name}`, href: `/admin/agencies/${agency.id}` });
    }
  }

  // Emails reach the customer screen; a booking reference does not, so the
  // customer hit is derived from the booking that matched rather than searched
  // for separately.
  const emails = new Set(
    bookings
      .filter((b) => b.contact.email.toLowerCase().includes(query))
      .map((b) => b.contact.email.toLowerCase()),
  );
  for (const email of emails) {
    hits.push({
      type: "customer",
      label: email,
      detail: `${bookings.filter((b) => b.contact.email.toLowerCase() === email).length} bookings`,
      href: `/admin/customers/${encodeURIComponent(email)}`,
    });
  }

  for (const supportCase of listCases()) {
    if (!`${supportCase.caseId} ${supportCase.category}`.toLowerCase().includes(query)) continue;
    hits.push({
      type: "case",
      label: supportCase.caseId,
      detail: `${supportCase.category} · ${supportCase.status}`,
      href: `/admin/cases`,
    });
  }

  return ok({ hits: hits.slice(0, 40) });
}
