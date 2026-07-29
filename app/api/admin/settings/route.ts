import { fail, localeFrom, ok, readJson } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { appendAudit, saveSettings, storedSettings } from "@/lib/admin/store";
import { currentMarkupPercent, MARKUP_RANGE, setMarkupOverride } from "@/lib/server/markup";
import { primeMarkup } from "@/lib/server/platform";
import { getHotelbedsConfig } from "@/lib/server/hotelbeds/config";
import { currentRates, FX_RANGE, isSaneRate, setFxOverrides } from "@/lib/server/fx";

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
    /*
     * Every currency with the rate in force and whether an operator set it.
     * Suppliers quote in their own currency — Hotelbeds in the destination's,
     * TourMind in yuan — so these rates decide what an agency is invoiced.
     */
    fx: currentRates(),
    fxRange: FX_RANGE,
  });
}

export async function PATCH(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const body = await readJson<{ markupPercent?: number; fxRates?: Record<string, number> }>(req);

  /*
   * A rate change on its own, without touching the markup.
   *
   * The two are separate commercial levers and are set on different days, so
   * sending one must not require restating the other — and must not audit a
   * markup change that never happened.
   */
  if (body?.fxRates && body.markupPercent === undefined) {
    const stored = await storedSettings();
    const next: Record<string, number> = { ...(stored?.fxRates ?? {}) };
    const changes: string[] = [];

    for (const [code, raw] of Object.entries(body.fxRates)) {
      const value = Number(raw);
      // An empty or cleared field returns that currency to the built-in table
      // rather than pinning today's number for ever.
      if (raw === null || raw === undefined || String(raw) === "") {
        if (next[code] !== undefined) changes.push(`${code}: cleared`);
        delete next[code];
        continue;
      }
      if (!isSaneRate(value)) {
        return fail("validation", "admin.fxRange", locale, { status: 422, fields: { [code]: "range" } });
      }
      if (next[code] !== value) changes.push(`${code}: ${next[code] ?? "default"} → ${value}`);
      next[code] = value;
    }

    const settings = {
      markupPercent: stored?.markupPercent ?? currentMarkupPercent(),
      fxRates: next,
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
    };
    await saveSettings(settings);
    setFxOverrides(next as Record<string, number>);

    if (changes.length) {
      await appendAudit({
        actor: session.email,
        action: "settings.fx",
        subject: "platform",
        detail: `Rate of exchange changed — ${changes.join(", ")}`,
      });
    }
    return ok({ fx: currentRates() });
  }

  const value = Number(body?.markupPercent);
  if (!Number.isFinite(value) || value < MARKUP_RANGE.min || value > MARKUP_RANGE.max) {
    return fail("validation", "admin.markupRange", locale, { status: 422, fields: { markupPercent: "range" } });
  }

  const before = currentMarkupPercent();
  const previous = await storedSettings();
  const settings = {
    markupPercent: Math.round(value * 10) / 10,
    // Rates are not part of this change and must survive it.
    fxRates: previous?.fxRates,
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
