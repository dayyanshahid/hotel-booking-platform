import { AgencySignInView } from "@/components/pages/agency-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Agent sign-in. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AgencySignInView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
