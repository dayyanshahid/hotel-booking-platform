import { AdminBookingView } from "@/components/pages/admin-b2c-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — one booking, with supplier reference and operator actions. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; reference: string }>;
}) {
  const { locale: raw, reference } = await params;
  return <AdminBookingView locale={(isLocale(raw) ? raw : "en") as Locale} reference={reference} />;
}
