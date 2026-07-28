import { AdminSignInView } from "@/components/pages/admin-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — operator sign-in. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  return <AdminSignInView locale={(isLocale(raw) ? raw : "en") as Locale} />;
}
