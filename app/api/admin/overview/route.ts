import { fail, localeFrom, ok } from "@/lib/server/api";
import { currentAdmin } from "@/lib/admin/session";
import { listBookings } from "@/lib/server/store";
import { agencyBalance, listAgencies, listAgencyBookings } from "@/lib/agency/store";
import { currentMarkupPercent } from "@/lib/server/markup";
import { primeMarkup } from "@/lib/server/platform";
import { quotaStatus } from "@/lib/server/hotelbeds/client";
import { getHotelbedsConfig, isHotelbedsEnabled } from "@/lib/server/hotelbeds/config";
import { getTourmindConfig, isTourmindEnabled } from "@/lib/server/tourmind/config";
import type { Booking } from "@/lib/types";

/**
 * The one screen an operator opens first.
 *
 * Deliberately answers "is anything wrong" before "how are we doing". A
 * platform this size fails in three ways — a supplier stops answering, a
 * booking gets stuck between us and a supplier, or an agency runs out of credit
 * mid-sale — and none of those are visible in a revenue figure. So the counts
 * that mean *act now* are computed alongside the ones that mean *we did well*.
 *
 * B2C and B2B are separated everywhere. They are different businesses with
 * different economics on the same inventory, and a single blended total hides
 * which one is actually working.
 */

/** Bookings whose state needs a human rather than time. */
function needsAttention(booking: Booking): boolean {
  return booking.status === "pending" || booking.status === "reconciliationRequired" || booking.status === "failed";
}

function isLive(booking: Booking): boolean {
  return booking.status === "confirmed" || booking.status === "pending";
}

export async function GET(req: Request) {
  const locale = localeFrom(req);
  const session = await currentAdmin();
  if (!session) return fail("accountSecurity", "admin.signInRequired", locale, { status: 401, action: "authenticate" });

  await primeMarkup();

  const [bookings, agencies] = await Promise.all([listBookings(), listAgencies()]);

  // Trade bookings are identified by their commercial record, not by guessing
  // from the booking itself — an agency booking looks exactly like a direct one
  // to the consumer routes, which is the point.
  const tradeByReference = new Map<string, { agencyId: string; cost: number; sell: number }>();
  for (const agency of agencies) {
    for (const record of await listAgencyBookings(agency.id)) {
      tradeByReference.set(record.reference, { agencyId: agency.id, cost: record.cost, sell: record.sell });
    }
  }

  const live = bookings.filter(isLive);
  const direct = live.filter((b) => !tradeByReference.has(b.reference));
  const trade = live.filter((b) => tradeByReference.has(b.reference));

  const sum = (list: Booking[]) => list.reduce((total, b) => total + b.price.total, 0);

  // Agency margin is what we keep on a trade booking: the public price less the
  // commission we granted. It is not the agency's own margin, which is theirs.
  const tradeCommission = trade.reduce((total, b) => {
    const record = tradeByReference.get(b.reference);
    return total + (record ? b.price.total - record.cost : 0);
  }, 0);

  const balances = await Promise.all(agencies.map((a) => agencyBalance(a.id)));
  const exposure = balances.reduce((total, balance) => total + (balance?.used ?? 0), 0);
  const headroom = balances.reduce((total, balance) => total + (balance?.available ?? 0), 0);

  const today = new Date().toISOString().slice(0, 10);
  const quota = quotaStatus();

  return ok({
    bookings: {
      total: bookings.length,
      live: live.length,
      today: bookings.filter((b) => b.createdAt.slice(0, 10) === today).length,
      attention: bookings.filter(needsAttention).length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    },
    direct: { count: direct.length, gross: sum(direct) },
    trade: { count: trade.length, gross: sum(trade), commission: tradeCommission },
    agencies: {
      total: agencies.length,
      active: agencies.filter((a) => a.status === "active").length,
      suspended: agencies.filter((a) => a.status !== "active").length,
      exposure,
      headroom,
      // Anyone under a tenth of their line will hit it during a normal week.
      lowCredit: balances.filter((b) => b && b.limit > 0 && b.available / b.limit < 0.1).length,
    },
    commercial: { markupPercent: currentMarkupPercent() },
    suppliers: [
      {
        id: "hotelbeds",
        configured: isHotelbedsEnabled(),
        environment: getHotelbedsConfig().baseUrl,
        quotaUsed: quota.used,
        // Null rather than an unserialisable Infinity when no local ceiling is
        // set; `quotaLimited` is the flag to branch on.
        quotaLimited: quota.limited,
        quotaRemaining: quota.limited ? quota.remaining : null,
      },
      {
        id: "tourmind",
        configured: isTourmindEnabled(),
        environment: getTourmindConfig().baseUrl,
      },
    ],
  });
}
