import { AlertsView } from "@/components/pages/service-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Price alerts — consented, per-alert unsubscribe (§5.12). */
export default async function AlertsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AlertsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
