import { AgencyOverviewView } from "@/components/pages/agency-dashboard-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — production, margin and credit, away from the working screen. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyOverviewView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
