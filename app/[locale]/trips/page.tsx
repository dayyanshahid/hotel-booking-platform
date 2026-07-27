import { TripsView } from "@/components/pages/trips-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-070 — trips list. */
export default async function TripsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <TripsView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
