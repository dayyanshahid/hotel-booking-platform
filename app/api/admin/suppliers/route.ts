import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { quotaStatus } from "@/lib/server/hotelbeds/client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import { getTourmindConfig, isTourmindEnabled } from "@/lib/server/tourmind/config";
import { tourmindHotels } from "@/lib/server/tourmind/catalogue";

/**
 * Supplier health.
 *
 * Deliberately reports configuration and local budget rather than calling the
 * suppliers to check. A status page that spends a live request every time it is
 * refreshed will exhaust a 50-a-day evaluation quota before lunch, and then the
 * thing it was monitoring stops working because of the monitoring.
 *
 * No credential is echoed — not even partially. Whether a key is present is
 * useful; what it is, is not.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  const hotelbeds = getHotelbedsConfig();
  // An empty catalogue means live search silently returns nothing from this
  // supplier — a failure that otherwise looks like "no availability".
  const tourmindCatalogue = await tourmindHotels().catch(() => []);
  const tourmind = getTourmindConfig();
  const quota = quotaStatus();

  return ok({
    suppliers: [
      {
        id: "hotelbeds",
        label: "Hotelbeds (HBX)",
        configured: isHotelbedsEnabled(),
        environment: hotelbeds.baseUrl,
        production: !hotelbeds.baseUrl.includes("test"),
        quota: { used: quota.used, remaining: quota.remaining, day: quota.day },
        notes: isHotelbedsEnabled() ? null : "hotelbeds.missingCredentials",
      },
      {
        id: "tourmind",
        label: "TourMind",
        configured: isTourmindEnabled(),
        environment: tourmind.baseUrl,
        production: !tourmind.baseUrl.includes("test"),
        catalogueSize: tourmindCatalogue.length,
        notes: isTourmindEnabled() ? null : "tourmind.missingCredentials",
      },
    ],
  });
}
