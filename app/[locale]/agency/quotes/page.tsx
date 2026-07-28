import { AgencyQuotesView } from "@/components/pages/agency-quotes-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — quotations sent to customers. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyQuotesView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
