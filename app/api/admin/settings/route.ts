import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit, saveSettings, storedSettings } from "@/lib/admin/store";
import { currentMarkupPercent, MARKUP_RANGE, setMarkupOverride } from "@/lib/server/markup";
import { primeMarkup } from "@/lib/server/platform";
import { getHotelbedsConfig } from "@/lib/server/hotelbeds/config";

/**
 * Commercial policy.
 *
 * One number, and it moves every price on the public site the moment it is
 * saved — which is exactly why it is bounded, audited, and shown next to the
 * deployed default so an operator can always see what they have changed it
 * from. Setting it back to the default clears the override rather than pinning
 * the current value, so a later deploy can still move it.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  await primeMarkup();
  const stored = await storedSettings();
  return ok({
    markupPercent: currentMarkupPercent(),
    deployedDefault: getHotelbedsConfig().markupPercent,
    overridden: stored !== null,
    updatedAt: stored?.updatedAt,
    updatedBy: stored?.updatedBy,
    range: MARKUP_RANGE,
  });
}

export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<{ markupPercent: number }>(req);
  const value = Number(body?.markupPercent);
  if (!Number.isFinite(value) || value < MARKUP_RANGE.min || value > MARKUP_RANGE.max) {
    return fail("validation", "admin.markupRange", locale, { status: 422, fields: { markupPercent: "range" } });
  }

  const before = currentMarkupPercent();
  const settings = {
    markupPercent: Math.round(value * 10) / 10,
    updatedAt: new Date().toISOString(),
    updatedBy: session.email,
  };
  await saveSettings(settings);
  // Apply to this instance immediately; others pick it up on their next prime.
  setMarkupOverride(settings.markupPercent);

  await appendAudit({
    actor: session.email,
    action: "settings.markup",
    subject: "platform",
    detail: `Platform markup changed`,
    before: `${before}%`,
    after: `${settings.markupPercent}%`,
  });

  return ok({ markupPercent: settings.markupPercent });
}
