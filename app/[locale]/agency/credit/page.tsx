import { AgencyCreditView } from "@/components/pages/agency-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Credit position and statement. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencyCreditView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
