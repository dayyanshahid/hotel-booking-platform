import { AgencyBookView } from "@/components/pages/agency-book-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — book a rate on the agency's credit account. */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; offerId: string }>;
}) {
  const { locale: raw, offerId } = await params;
  return <AgencyBookView locale={(isLocale(raw) ? raw : "en") as Locale} offerId={offerId} />;
}
