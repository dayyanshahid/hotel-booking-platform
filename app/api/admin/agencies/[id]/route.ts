import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { agencyBalance, getAgency, listAgencyBookings, listAgents, listLedger, saveAgency, statementPeriods } from "@/lib/agency/store";

/**
 * One agency, and the terms we trade with it on.
 *
 * Commission, credit limit and status are ours to set — they are the contract.
 * The agency's own markup is not editable here even though we can see it: their
 * selling price is their business, and an operator changing it would be
 * changing what someone else's customer pays.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const [balance, agents, bookings, ledger, periods] = await Promise.all([
    agencyBalance(id),
    listAgents(id),
    listAgencyBookings(id),
    listLedger(id, 50),
    statementPeriods(id),
  ]);

  return ok({
    agency,
    balance,
    agents,
    bookings: bookings.slice(0, 25),
    ledger,
    periods,
    production: bookings
      .filter((b) => b.status === "confirmed" || b.status === "pending")
      .reduce(
        (sum, b) => ({
          count: sum.count + 1,
          cost: sum.cost + b.cost,
          // What *we* keep: the public price less what the agency paid. Their
          // own margin (sell − cost) is theirs and is not our revenue.
          // Records written before publicPrice existed fall back to the
          // commission in force, which is the best available answer for them.
          retained:
            sum.retained +
            ((b.publicPrice ?? Math.round(b.cost / Math.max(0.01, 1 - agency.commissionPercent / 100))) - b.cost),
        }),
        { count: 0, cost: 0, retained: 0 },
      ),
  });
}

interface Patch {
  commissionPercent?: number;
  creditLimit?: number;
  paymentDays?: number;
  status?: "active" | "suspended";
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agency = await getAgency(id);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<Patch>(req);
  if (!body) return fail("validation", "error.validation", locale, { status: 400 });

  const next = { ...agency };
  const changes: string[] = [];

  if (body.commissionPercent !== undefined) {
    const value = Number(body.commissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 40) {
      return fail("validation", "error.validation", locale, { status: 422, fields: { commissionPercent: "range" } });
    }
    if (value !== agency.commissionPercent) {
      changes.push(`commission ${agency.commissionPercent}% → ${value}%`);
      next.commissionPercent = Math.round(value * 10) / 10;
    }
  }

  if (body.creditLimit !== undefined) {
    const value = Number(body.creditLimit);
    if (!Number.isFinite(value) || value < 0) {
      return fail("validation", "error.validation", locale, { status: 422, fields: { creditLimit: "invalid" } });
    }
    if (value !== agency.credit.limit) {
      changes.push(`limit ${agency.credit.limit} → ${value}`);
      next.credit = { ...next.credit, limit: Math.round(value) };
    }
  }

  if (body.paymentDays !== undefined) {
    const value = Math.min(120, Math.max(0, Math.round(Number(body.paymentDays))));
    if (value !== agency.credit.paymentDays) {
      changes.push(`terms ${agency.credit.paymentDays}d → ${value}d`);
      next.credit = { ...next.credit, paymentDays: value };
    }
  }

  if (body.status && body.status !== agency.status) {
    changes.push(`status ${agency.status} → ${body.status}`);
    next.status = body.status;
  }

  if (!changes.length) return ok({ agency });

  await saveAgency(next);
  // Commission and credit changes are money changes. The log names the person
  // and keeps both sides of every value, so a reversal never needs a guess.
  await appendAudit({
    actor: session.email,
    action: "agency.update",
    subject: agency.id,
    detail: `${agency.name}: ${changes.join(", ")}`,
    before: `${agency.commissionPercent}% / ${agency.credit.limit} / ${agency.status}`,
    after: `${next.commissionPercent}% / ${next.credit.limit} / ${next.status}`,
  });

  return ok({ agency: next });
}
