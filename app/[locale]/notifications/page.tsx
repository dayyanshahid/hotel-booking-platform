import { NotificationsView } from "@/components/pages/service-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-081 — notification centre. */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <NotificationsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
