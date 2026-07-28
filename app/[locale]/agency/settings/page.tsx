import { AgencySettingsView } from "@/components/pages/agency-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Commission, markup and terms. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencySettingsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
