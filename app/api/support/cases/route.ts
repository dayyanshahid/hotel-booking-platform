import { fail, localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { getBooking, listCases, saveCase } from "@/lib/server/store";
import type { SupportCase } from "@/lib/types";

const SLA_BY_CHANNEL: Record<SupportCase["channel"], number> = {
  chat: 1,
  whatsapp: 2,
  email: 8,
  call: 1,
};

/** POST /api/support/cases — contextual case with consented booking context (§5.11). */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{
    category: string;
    channel: SupportCase["channel"];
    message: string;
    bookingReference?: string;
    shareContext?: boolean;
  }>(req);

  if (!body?.category || !body.channel) return fail("validation", "error.validation", locale, { status: 422 });

  const booking = body.bookingReference && body.shareContext ? await getBooking(body.bookingReference) : undefined;
  const now = new Date().toISOString();

  const supportCase: SupportCase = {
    caseId: `SC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    bookingReference: booking?.reference,
    category: sanitize(body.category, 60),
    channel: body.channel,
    status: "open",
    slaHours: SLA_BY_CHANNEL[body.channel] ?? 8,
    createdAt: now,
    messages: [
      { at: now, from: "customer", body: sanitize(body.message ?? "", 800) },
      {
        at: now,
        from: "agent",
        body: booking
          ? locale === "ar"
            ? `استلمنا طلبك بخصوص الحجز ${booking.reference} في ${booking.hotelName}. لدينا تفاصيل الحجز ولن نطلب منك تكرارها.`
            : `We have your request about booking ${booking.reference} at ${booking.hotelName}. Your booking context is attached — you will not be asked to repeat it.`
          : locale === "ar"
            ? "استلمنا طلبك وسنرد ضمن مدة الاستجابة الموضحة."
            : "We have your request and will reply within the response time shown.",
      },
    ],
  };

  await saveCase(supportCase);
  return ok(supportCase);
}

export async function GET() {
  return ok({ cases: await listCases() });
}

export const dynamic = "force-dynamic";
