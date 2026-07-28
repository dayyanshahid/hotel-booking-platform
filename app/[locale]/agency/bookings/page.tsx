import { AgencyBookingsView } from "@/components/pages/agency-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** The agency's book of business. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyBookingsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
