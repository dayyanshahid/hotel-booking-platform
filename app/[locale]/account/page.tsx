import { AccountView } from "@/components/pages/account-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-062 — profile, preferences, traveler profiles, rewards and privacy. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AccountView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
