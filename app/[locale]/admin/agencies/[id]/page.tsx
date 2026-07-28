import { AdminAgencyView } from "@/components/pages/admin-b2b-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** Super admin — one agency: terms, credit, statements and production. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  return <AdminAgencyView locale={(isLocale(raw) ? raw : "en") as Locale} id={id} />;
}
