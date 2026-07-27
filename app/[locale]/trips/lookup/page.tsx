import { BookingLookupView } from "@/components/pages/trips-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Guest booking retrieval by reference + email OTP (E-22). */
export default async function LookupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <BookingLookupView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
