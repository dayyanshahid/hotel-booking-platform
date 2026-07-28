import { AgencySearchView } from "@/components/pages/agency-search-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — trade search with cost and margin on every line. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencySearchView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
