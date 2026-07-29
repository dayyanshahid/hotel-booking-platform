import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, saveAgency } from "@/lib/agency/store";
import type { AgencyProfile, MarkupOverride, MarkupPolicy, MarkupRule } from "@/lib/agency/types";

/**
 * The agency's own margin rule and the details that appear on its documents.
 *
 * An agency sets what it charges its customers; it does not set what we charge
 * it. `commissionPercent` and the credit line are contractual and are read-only
 * here — a settings form that could raise its own discount is not a settings
 * form.
 */

/** A markup a customer would notice as an error. Rejected rather than clamped. */
const MAX_PERCENT = 60;
const MAX_OVERRIDES = 25;

function readRule(input: unknown): MarkupRule | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { mode?: unknown; value?: unknown };
  const mode = raw.mode;
  const value = Number(raw.value);
  if ((mode !== "percent" && mode !== "fixed") || !Number.isFinite(value) || value < 0) return null;
  if (mode === "percent" && value > MAX_PERCENT) return null;
  return { mode, value };
}

/**
 * A logo URL that is safe to put in an image tag.
 *
 * The agency types this in and it ends up on every voucher their customers
 * receive, so it is not merely a string. `javascript:` and `data:` are the
 * obvious abuses; plain `http:` is the quiet one, because a single insecure
 * image turns an otherwise secure page into a mixed-content warning on the
 * document a traveller is asked to trust. HTTPS only.
 *
 * An empty value clears the logo rather than failing, which is how an agency
 * removes one.
 */
function safeLogoUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString().slice(0, 400) : undefined;
  } catch {
    return undefined;
  }
}

export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await activeAgent();
  if (!session) return fail("accountSecurity", "agency.signInRequired", locale, { status: 401, action: "authenticate" });
  if (session.role !== "admin") {
    return fail("policyRestriction", "agency.adminOnly", locale, { status: 403, action: "contactSupport" });
  }

  const agency = await getAgency(session.agencyId);
  if (!agency) return fail("validation", "error.notFound", locale, { status: 404 });

  const body = await readJson<{ markup?: unknown; profile?: Partial<AgencyProfile> }>(req);
  let markup: MarkupPolicy = agency.markup;

  if (body?.markup) {
    const raw = body.markup as { default?: unknown; overrides?: unknown };
    const fallback = readRule(raw.default);
    if (!fallback) {
      return fail("validation", "agency.markupRange", locale, { status: 422, fields: { markup: "range" } });
    }

    const overrides: MarkupOverride[] = [];
    for (const entry of Array.isArray(raw.overrides) ? raw.overrides.slice(0, MAX_OVERRIDES) : []) {
      const item = entry as { countryCode?: unknown; rule?: unknown };
      const countryCode = String(item.countryCode ?? "")
        .trim()
        .toUpperCase();
      const rule = readRule(item.rule);
      if (!/^[A-Z]{2}$/.test(countryCode) || !rule) {
        return fail("validation", "agency.markupRange", locale, { status: 422, fields: { overrides: "invalid" } });
      }
      // A country listed twice is ambiguous to the person who wrote it, not
      // just to the resolver — so it is refused rather than silently deduped.
      if (overrides.some((o) => o.countryCode === countryCode)) {
        return fail("validation", "agency.duplicateCountry", locale, {
          status: 422,
          fields: { overrides: "duplicate" },
        });
      }
      overrides.push({ countryCode, rule });
    }

    markup = { default: { ...fallback, currency: agency.credit.currency }, overrides };
  }

  const profile: AgencyProfile = body?.profile
    ? {
        legalName: sanitize(body.profile.legalName, 120) || agency.profile.legalName,
        address: sanitize(body.profile.address, 160),
        city: sanitize(body.profile.city, 80),
        taxNumber: sanitize(body.profile.taxNumber, 40),
        email: sanitize(body.profile.email, 120).toLowerCase(),
        phone: sanitize(body.profile.phone, 40),
        logoUrl: safeLogoUrl(body.profile.logoUrl) ?? agency.profile.logoUrl,
      }
    : agency.profile;

  await saveAgency({ ...agency, markup, profile });
  return ok({ markup, profile });
}
