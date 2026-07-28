import { AgencyTeamView } from "@/components/pages/agency-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agents on the account. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyTeamView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
