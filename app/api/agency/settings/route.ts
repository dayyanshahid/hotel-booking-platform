import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { activeAgent } from "@/lib/agency/session";
import { getAgency, saveAgency } from "@/lib/agency/store";
import type { AgencyProfile, MarkupOverride, MarkupPolicy, MarkupRule } from "@/lib/agency/types";
import { normalizeHex } from "@/lib/agency/branding";
import { MAX_OVERRIDES, ruleIsValid } from "@/lib/agency/markup-policy";

/**
 * The agency's own margin rule and the details that appear on its documents.
 *
 * An agency sets what it charges its customers; it does not set what we charge
 * it. `commissionPercent` and the credit line are contractual and are read-only
 * here — a settings form that could raise its own discount is not a settings
 * form.
 */

/**
 * A rule off the wire, or nothing.
 *
 * The ceilings and the shape live in `markup-policy` so the form can warn
 * about what this is going to refuse, rather than an agency discovering it by
 * pressing Save. This still decides; it just no longer holds the knowledge on
 * its own.
 */
function readRule(input: unknown): MarkupRule | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { mode?: unknown; value?: unknown };
  const candidate = { mode: raw.mode, value: Number(raw.value) } as MarkupRule;
  return ruleIsValid(candidate) ? { mode: candidate.mode, value: candidate.value } : null;
}

/**
 * A URL safe to put on a customer's document — the logo, or the website.
 *
 * The agency types these in and they end up on every quotation and voucher
 * their customers receive, so they are not merely strings. `javascript:` and
 * `data:` are the obvious abuses; plain `http:` is the quiet one, because a
 * single insecure image turns an otherwise secure page into a mixed-content
 * warning on the document a traveller is asked to trust. HTTPS only.
 *
 * An empty value clears the field rather than failing, which is how an agency
 * removes one.
 */
function safeHttpsUrl(value: unknown): string | undefined {
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

/**
 * The accent, canonicalised — or nothing, if it is not a colour.
 *
 * `normalizeHex` is the same function the settings preview and both documents
 * use, so what an agency sees before saving is what gets stored. An empty value
 * clears the colour back to the default rather than failing, which is how an
 * agency removes one.
 */
function safeBrandColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.trim()) return "";
  return normalizeHex(value) ?? undefined;
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

  let profile: AgencyProfile = agency.profile;

  if (body?.profile) {
    /*
     * Branding is refused rather than dropped.
     *
     * These used to fall back to the stored value when they did not validate,
     * so an agency that pasted an `http://` logo saw the field revert on the
     * next load with nothing said. Silently discarding what someone typed is
     * the worst of the options: they cannot tell whether it saved, and the
     * document they are about to send a customer is not the one they designed.
     */
    const logoUrl = safeHttpsUrl(body.profile.logoUrl);
    const website = safeHttpsUrl(body.profile.website);
    const brandColor = safeBrandColor(body.profile.brandColor);

    if (logoUrl === undefined && body.profile.logoUrl !== undefined) {
      return fail("validation", "agency.logoInvalid", locale, { status: 422, fields: { logoUrl: "invalid" } });
    }
    if (website === undefined && body.profile.website !== undefined) {
      return fail("validation", "agency.websiteInvalid", locale, { status: 422, fields: { website: "invalid" } });
    }
    if (brandColor === undefined && body.profile.brandColor !== undefined) {
      return fail("validation", "agency.colorInvalid", locale, { status: 422, fields: { brandColor: "invalid" } });
    }

    profile = {
      legalName: sanitize(body.profile.legalName, 120) || agency.profile.legalName,
      address: sanitize(body.profile.address, 160),
      city: sanitize(body.profile.city, 80),
      taxNumber: sanitize(body.profile.taxNumber, 40),
      email: sanitize(body.profile.email, 120).toLowerCase(),
      phone: sanitize(body.profile.phone, 40),
      logoUrl: logoUrl ?? agency.profile.logoUrl,
      website: website ?? agency.profile.website,
      brandColor: brandColor ?? agency.profile.brandColor,
      // Long enough for a real set of booking conditions, short enough that it
      // cannot become a second page nobody meant to send.
      documentFooter: sanitize(body.profile.documentFooter, 1200),
    };
  }

  await saveAgency({ ...agency, markup, profile });
  return ok({ markup, profile });
}
