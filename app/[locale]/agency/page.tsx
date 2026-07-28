import { AgencyDashboardView } from "@/components/pages/agency-dashboard-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agency portal — what needs the agent today. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyDashboardView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
