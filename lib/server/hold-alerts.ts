import "server-only";
import { listAgents } from "@/lib/agency/store";
import { pushNotification, listNotifications } from "./store";
import { formatDateTime } from "@/lib/format";
import type { AgencyBooking } from "@/lib/agency/types";
import type { Locale } from "@/lib/types";

/**
 * Telling an agency before we cancel their hold.
 *
 * The client asked for a warning forty-eight hours before a cancellation
 * deadline. It is not decoration: a hold that lapses is a sale the agency lost
 * because nobody told them the clock was running, and the customer had usually
 * said yes days earlier.
 *
 * A warning goes to the dashboard of every agent on the account rather than
 * only to whoever placed the hold. The person who took the booking is often not
 * the person at the desk when the deadline arrives, and a notification only
 * they can see is a notification nobody acts on.
 */

/** How far ahead of the deadline the warning goes out. */
export const HOLD_WARNING_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Stable per booking, so a sweep every few minutes cannot warn twice. */
function alertId(reference: string): string {
  return `hold-due-${reference}`;
}

/**
 * The email side.
 *
 * No mail transport is configured on this deployment, and inventing one would
 * mean either a silent no-op that looks like it works or a dependency on an
 * account nobody has opened. So the message is composed here and handed to
 * whatever transport is wired in later; until then it is recorded in the
 * dashboard feed, which is where an agent actually looks.
 */
export interface HoldAlertMail {
  to: string;
  subject: string;
  body: string;
}

export function composeHoldEmail(booking: AgencyBooking, to: string, locale: Locale): HoldAlertMail {
  const when = booking.holdExpiresAt ? formatDateTime(booking.holdExpiresAt, locale) : "";
  const ar = locale === "ar";
  return {
    to,
    subject: ar
      ? `ينتهي الحجز المؤقت ${booking.reference} قريبًا`
      : `Hold ${booking.reference} is about to be released`,
    body: ar
      ? `الحجز المؤقت ${booking.reference} في ${booking.hotelName} سيُلغى تلقائيًا في ${when} ما لم يُصدر قبل ذلك. الإلغاء التلقائي يتم داخل فترة الإلغاء المجاني، فلا تُحتسب أي رسوم.`
      : `The hold on ${booking.reference} at ${booking.hotelName} will be released automatically at ${when} unless it is issued first. The release happens inside the free-cancellation window, so nothing is charged.`,
  };
}

/**
 * Warn everyone on the account about holds nearing their deadline.
 *
 * Returns what was sent rather than a count, so a scheduled run can be read
 * later and a person can see which bookings were warned about.
 */
export async function notifyHoldsDue(
  due: { agencyId: string; booking: AgencyBooking }[],
  locale: Locale,
): Promise<{ reference: string; recipients: number }[]> {
  const sent: { reference: string; recipients: number }[] = [];

  for (const { agencyId, booking } of due) {
    const agents = (await listAgents(agencyId)).filter((agent) => agent.active);
    if (!agents.length) continue;

    let recipients = 0;
    for (const agent of agents) {
      const channel = agent.email.toLowerCase();
      // The sweep runs often; the warning is sent once. Keyed on the booking,
      // so a second run finds it already there and moves on.
      const already = (await listNotifications(channel)).some((note) => note.id === alertId(booking.reference));
      if (already) continue;

      const mail = composeHoldEmail(booking, agent.email, locale);
      await pushNotification(channel, {
        id: alertId(booking.reference),
        kind: "reminder",
        title: mail.subject,
        body: mail.body,
        href: `/agency/bookings/${booking.reference}`,
        createdAt: new Date().toISOString(),
        read: false,
      });
      recipients += 1;
    }

    if (recipients) sent.push({ reference: booking.reference, recipients });
  }

  return sent;
}
