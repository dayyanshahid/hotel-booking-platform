import { fail, localeFrom, ok } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { agencyBalance, listLedger } from "@/lib/agency/store";

/** The credit statement: every movement, newest first, with its booking. */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });

  const [entries, balance] = await Promise.all([
    listLedger(session.agencyId, 100),
    agencyBalance(session.agencyId),
  ]);
  return ok({ entries, balance });
}
