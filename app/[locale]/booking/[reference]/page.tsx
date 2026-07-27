import type { Metadata } from "next";
import { BookingOutcomeView } from "@/components/pages/booking-outcome-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** F-054 / F-055 — confirmation, pending reconciliation and voucher. */
export default async function BookingOutcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, reference } = await params;
  const query = await searchParams;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const email = typeof query.email === "string" ? query.email : "";
  const emailFailed = query.emailFailed === "1";

  return (
    <BookingOutcomeView locale={locale} reference={reference} email={email} emailFailed={emailFailed} />
  );
}
