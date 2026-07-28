import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, saveAgency } from "@/lib/agency/store";
import type { MarkupRule } from "@/lib/agency/types";

/**
 * The agency's own margin rule.
 *
 * An agency sets what it charges its customers; it does not set what we charge
 * it. `commissionPercent` and the credit line are contractual and are read-only
 * here — a settings form that could raise its own discount is not a settings
 * form.
 */
export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const body = await readJson<{ markup: MarkupRule }>(req);
  const mode = body?.markup?.mode;
  const value = Number(body?.markup?.value);
  if ((mode !== "percent" && mode !== "fixed") || !Number.isFinite(value) || value < 0) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { markup: "invalid" } });
  }
  // A 400% markup is a typo, not a strategy, and it would go out on quotes.
  if (mode === "percent" && value > 60) {
    return fail("validation", "agency.markupRange", locale, { status: 422, fields: { markup: "range" } });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const markup: MarkupRule = { mode, value, currency: agency.credit.currency };
  await saveAgency({ ...agency, markup });
  return ok({ markup });
}
