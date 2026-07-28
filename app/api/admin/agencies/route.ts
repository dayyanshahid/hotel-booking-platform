import { fail, isEmail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit } from "@/lib/admin/store";
import { agencyBalance, getAgentByEmail, listAgencies, listAgents, saveAgency, saveAgent } from "@/lib/agency/store";
import { isCurrencyCode } from "@/lib/currencies";
import type { Agency, Agent } from "@/lib/agency/types";

/**
 * Onboarding.
 *
 * Until this existed an agency could only be created by editing a file on the
 * server, which is not a process — it is a bottleneck with a deploy attached.
 * Creating one here also creates its first administrator, because an agency
 * with no way in is not onboarded, it is just a row.
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const agencies = await listAgencies();
  const rows = await Promise.all(
    agencies.map(async (agency) => {
      const [balance, agents] = await Promise.all([agencyBalance(agency.id), listAgents(agency.id)]);
      return {
        ...agency,
        balance,
        agentCount: agents.filter((a) => a.active).length,
      };
    }),
  );
  return ok({ agencies: rows });
}

interface Body {
  name: string;
  countryCode: string;
  commissionPercent: number;
  creditLimit: number;
  currency: string;
  paymentDays: number;
  adminName: string;
  adminEmail: string;
}

export async function POST(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<Body>(req);
  if (!body) return fail("validation", "error.validation", locale, { status: 400 });

  const fields: Record<string, string> = {};
  if (!body.name?.trim()) fields.name = "required";
  if (!/^[A-Za-z]{2}$/.test(body.countryCode ?? "")) fields.countryCode = "invalid";
  if (!isCurrencyCode((body.currency ?? "").toUpperCase())) fields.currency = "invalid";
  if (!Number.isFinite(body.commissionPercent) || body.commissionPercent < 0 || body.commissionPercent > 40) {
    // Above 40% we would be selling below our own cost on most rates.
    fields.commissionPercent = "range";
  }
  if (!Number.isFinite(body.creditLimit) || body.creditLimit < 0) fields.creditLimit = "invalid";
  if (!body.adminEmail || !isEmail(body.adminEmail)) fields.adminEmail = "invalid";
  if (!body.adminName?.trim()) fields.adminName = "required";
  if (Object.keys(fields).length) {
    return fail("validation", "error.validation", locale, { status: 422, fields });
  }

  const existing = await getAgentByEmail(body.adminEmail);
  if (existing) {
    return fail("policyRestriction", "agency.emailTaken", locale, { status: 409, action: "contactSupport" });
  }

  const now = new Date().toISOString();
  const currency = body.currency.toUpperCase();
  const id = `agc_${Math.random().toString(36).slice(2, 10)}`;
  const agency: Agency = {
    id,
    name: sanitize(body.name, 120),
    slug: slugify(body.name) || id,
    countryCode: body.countryCode.toUpperCase(),
    status: "active",
    commissionPercent: Math.round(body.commissionPercent * 10) / 10,
    markup: { default: { mode: "percent", value: 10, currency }, overrides: [] },
    credit: {
      limit: Math.round(body.creditLimit),
      currency,
      paymentDays: Math.min(120, Math.max(0, Math.round(body.paymentDays || 30))),
    },
    profile: {
      legalName: sanitize(body.name, 120),
      address: "",
      city: "",
      email: sanitize(body.adminEmail, 120).toLowerCase(),
      phone: "",
    },
    createdAt: now,
  };

  const admin: Agent = {
    id: `agt_${Math.random().toString(36).slice(2, 10)}`,
    agencyId: id,
    email: sanitize(body.adminEmail, 120).toLowerCase(),
    name: sanitize(body.adminName, 60),
    role: "admin",
    active: true,
    createdAt: now,
  };

  await saveAgency(agency);
  await saveAgent(admin);
  await appendAudit({
    actor: session.email,
    action: "agency.create",
    subject: agency.id,
    detail: `Onboarded ${agency.name} at ${agency.commissionPercent}% commission, ${agency.credit.limit} ${currency} limit`,
  });

  return ok({ agency, admin });
}
