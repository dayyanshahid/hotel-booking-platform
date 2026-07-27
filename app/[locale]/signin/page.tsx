import { SignInView } from "@/components/pages/account-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-060 — passwordless sign-in. No password is ever collected (§5.10). */
export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <SignInView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
