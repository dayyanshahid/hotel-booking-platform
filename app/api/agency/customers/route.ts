import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent, agentWithPermission } from "@/lib/agency/session";
import {
  getCustomer,
  listAgencyBookings,
  listCustomers,
  listQuotes,
  removeCustomer,
  saveCustomer,
} from "@/lib/agency/store";
import { customerHistories, duplicateOf } from "@/lib/agency/customers";
import type { AgencyCustomer } from "@/lib/agency/types";

/** The agency's own client list. Scoped to their agency on every operation. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  const [customers, quotes, bookings] = await Promise.all([
    listCustomers(session.agencyId),
    listQuotes(session.agencyId),
    listAgencyBookings(session.agencyId),
  ]);
  /*
   * Their trade, counted here rather than in the browser.
   *
   * The screen would otherwise fetch every quote and every booking the agency
   * has ever written in order to count two numbers per row — and it would do
   * it on a page whose whole job is a list of names.
   */
  return ok({ customers, history: customerHistories(customers, quotes, bookings) });
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

  const body = await readJson<Partial<AgencyCustomer> & { id?: string }>(req);
  if (!body?.name?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { name: "required" } });
  }
  if (body.email && !isEmail(body.email)) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { email: "invalid" } });
  }

  /*
   * One address, one record.
   *
   * This module exists because a name spelled two ways across a quote and a
   * voucher has to be reconciled by hand. Two records for one address is the
   * same problem a step earlier, and the easiest moment to make it is when
   * somebody is in a hurry with a customer on the phone. Refused rather than
   * merged: merging two records is a decision about somebody's trading
   * history, and it is not this endpoint's to take silently.
   */
  const book = await listCustomers(session.agencyId);
  const clash = duplicateOf(body.email, book, body.id);
  if (clash) {
    return fail("validation", "agency.customerDuplicate", locale, {
      status: 409,
      fields: { email: clash.name },
    });
  }

  const now = new Date().toISOString();
  // An id means an edit; editing is scoped so one agency cannot rewrite
  // another's client by guessing an id.
  const existing = body.id ? await getCustomer(body.id) : undefined;
  if (existing && existing.agencyId !== session.agencyId) {
    return fail("validation", "error.notFound", locale, { status: 404 });
  }

  const customer: AgencyCustomer = {
    id: existing?.id ?? `cus_${Math.random().toString(36).slice(2, 10)}`,
    agencyId: session.agencyId,
    name: sanitize(body.name, 120),
    email: body.email ? sanitize(body.email, 120).toLowerCase() : undefined,
    phone: sanitize(body.phone, 40) || undefined,
    reference: sanitize(body.reference, 40) || undefined,
    notes: sanitize(body.notes, 400) || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await saveCustomer(customer);
  return ok({ customer });
}

export async function DELETE(req: Request) {
  const locale = localeFrom(req);
  const guard = await agentWithPermission("booking");
  if ("denied" in guard) {
    const authed = await activeAgent();
    return authed
      ? fail("accountSecurity", "agency.notPermitted", locale, { status: 403 })
      : fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  }
  const session = guard.session;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const removed = await removeCustomer(session.agencyId, id);
  if (!removed) return fail("validation", "error.notFound", locale, { status: 404 });
  return ok({ removed: true });
}
