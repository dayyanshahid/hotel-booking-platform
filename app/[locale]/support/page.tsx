import { SupportView } from "@/components/pages/service-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-080 — support entry point, contextual to a booking when one is supplied. */
export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  const query = await searchParams;
  const booking = typeof query.booking === "string" ? query.booking : undefined;
  return <SupportView locale={(isLocale(raw) ? raw : "en") as Locale} bookingReference={booking} />;
}
