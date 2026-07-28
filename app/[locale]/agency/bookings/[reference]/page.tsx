import { AgencyBookingView } from "@/components/pages/agency-booking-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — one booking, with its voucher and commercial figures. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale: raw, reference } = await params;
  return <AgencyBookingView locale={(isLocale(raw) ? raw : "en") as Locale} reference={reference} />;
}
