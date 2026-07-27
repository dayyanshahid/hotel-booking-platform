import { SavedView } from "@/components/pages/account-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-061 — saved hotels with stale-price handling and privacy-safe sharing. */
export default async function SavedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <SavedView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
