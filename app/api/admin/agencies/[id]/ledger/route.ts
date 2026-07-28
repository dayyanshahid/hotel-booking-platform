import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { agencyBalance, appendLedger, getAgency } from "@/lib/agency/store";
import type { LedgerEntry } from "@/lib/agency/types";

/**
 * Recording a payment, or correcting the account.
 *
 * A settlement is money received: it frees the credit the agency's bookings
 * committed. An adjustment is anything else a human decided — a goodwill
 * credit, a correction after a duplicate posting — and it exists precisely so
 * that nobody is ever tempted to fix a balance by editing history. The ledger
 * is append-only; the way to change a number is to post the opposite one.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ kind: "settlement" | "adjustment"; amount: number; note: string }>(req);
  const amount = Number(body?.amount);
  if ((body?.kind !== "settlement" && body?.kind !== "adjustment") || !Number.isFinite(amount) || amount === 0) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { amount: "invalid" } });
  }
  if (!body.note?.trim()) {
    return fail("validation", "error.validation", locale, { status: 422, fields: { note: "required" } });
  }

  const balance = await agencyBalance(id);
  // A settlement is always a positive movement — money in. Allowing a negative
  // one would let a typo silently invent debt.
  const signed = body.kind === "settlement" ? Math.abs(Math.round(amount)) : Math.round(amount);

  if (body.kind === "settlement" && balance && signed > balance.used) {
    return fail("validation", "admin.overSettlement", locale, { status: 422, fields: { amount: "range" } });
  }

  const entry: LedgerEntry = {
    id: `led_${body.kind}_${Math.random().toString(36).slice(2, 10)}`,
    agencyId: id,
    at: new Date().toISOString(),
    amount: signed,
    currency: agency.credit.currency,
    kind: body.kind,
    note: `${sanitize(body.note, 200)} · ${session.email}`,
  };

  await appendLedger(entry);
  await appendAudit({
    actor: session.email,
    action: `ledger.${body.kind}`,
    subject: agency.id,
    detail: `${agency.name}: ${signed} ${agency.credit.currency} — ${sanitize(body.note, 200)}`,
    before: String(balance?.used ?? 0),
    after: String(Math.max(0, (balance?.used ?? 0) - signed)),
  });

  return ok({ entry, balance: await agencyBalance(id) });
}
