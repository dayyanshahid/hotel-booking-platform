import { AgencyQuoteView } from "@/components/pages/agency-quotes-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — one quotation, printable for the customer. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  return <AgencyQuoteView locale={(isLocale(raw) ? raw : "en") as Locale} id={id} />;
}
