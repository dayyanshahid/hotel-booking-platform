import { BookingDetailView } from "@/components/pages/trips-views";
import { isLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** F-071 to F-073 — booking detail, cancellation quote and refund status. */
export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, reference } = await params;
  const query = await searchParams;
  const email = typeof query.email === "string" ? query.email : "";
  return (
    <BookingDetailView locale={(isLocale(raw) ? raw : "en") as Locale} reference={reference} email={email} />
  );
}
