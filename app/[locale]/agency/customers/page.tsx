import { AgencyCustomersView } from "@/components/pages/agency-customers-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — the agency's own client list. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyCustomersView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
