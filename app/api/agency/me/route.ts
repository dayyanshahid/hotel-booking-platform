import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { agencyBalance, getAgency } from "@/lib/agency/store";

/** The signed-in agent, their agency's terms, and its credit position. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [agency, balance] = await Promise.all([getAgency(session.agencyId), agencyBalance(session.agencyId)]);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  return ok({
    session,
    agency: {
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      countryCode: agency.countryCode,
      commissionPercent: agency.commissionPercent,
      markup: agency.markup,
      credit: agency.credit,
    },
    balance,
  });
}
