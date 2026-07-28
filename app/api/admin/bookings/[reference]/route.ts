import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { getBooking, getSupplierReference } from "@/lib/server/store";
import { getAgencyBooking, getAgency } from "@/lib/agency/store";

/**
 * One booking, with everything an operator needs to resolve a problem.
 *
 * This is the only place the supplier reference is ever exposed, and only to a
 * signed-in operator: when a property says they have no record of a stay,
 * somebody has to be able to quote the supplier's own number back at them. It
 * is not on the customer's screens, the agency's screens, or in any response
 * either of them can reach.
 */
export async function GET(req: Request, ctx: { params: Promise<{ reference: string }> }) {
  const { reference } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const booking = await getBooking(reference);
  if (!booking) return fail("validation", "error.notFound", locale, { status: 404 });

  const trade = await getAgencyBooking(reference);
  const agency = trade ? await getAgency(trade.agencyId) : undefined;
  const supplier = getSupplierReference(reference);

  return ok({
    booking,
    trade: trade ? { ...trade, agencyName: agency?.name ?? trade.agencyId } : null,
    supplier: supplier ? { source: supplier.source, reference: supplier.reference } : null,
  });
}
