import type { Metadata } from "next";
import { CheckoutView } from "@/components/pages/checkout-view";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Checkout is never indexed and uses a focused shell (§3.3). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale: raw, sessionId } = await params;
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  return <CheckoutView locale={locale} sessionId={sessionId} />;
}
