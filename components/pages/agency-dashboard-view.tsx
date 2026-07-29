"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Money, Nothing, PageHeader, Section, Stat, StatGrid, StatSkeleton, TableSkeleton } from "@/components/agency/ui";
import { Badge, Button, Card, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { formatDate, todayIso } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyBooking, AgencyQuote } from "@/lib/agency/types";
import type { Locale } from "@/lib/types";
import { apiUrl } from "@/lib/api-origin";

/**
 * The screen an agent opens first.
 *
 * It used to be three figures and a list of everything ever booked, which
 * answers "how are we doing" — a question nobody has at 9am. What they have is
 * "what needs me today", so the page leads with arrivals about to happen and
 * quotes about to expire, and keeps the totals underneath where they belong.
 */
export function AgencyDashboardView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{(context) => <Dashboard locale={locale} context={context} />}</PortalShell>;
}

function Dashboard({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const [bookings, setBookings] = useState<AgencyBooking[] | null>(null);
  const [quotes, setQuotes] = useState<AgencyQuote[] | null>(null);

  useEffect(() => {
    void (async () => {
      const [b, q] = await Promise.all([
        fetch(apiUrl("/api/agency/bookings"), { credentials: "same-origin" }).then((r) => r.json()),
        fetch(apiUrl("/api/agency/quotes"), { credentials: "same-origin" }).then((r) => r.json()),
      ]);
      setBookings(b.ok ? b.data.bookings : []);
      setQuotes(q.ok ? q.data.quotes : []);
    })();
  }, []);

  const currency = context.balance?.currency ?? context.agency.credit.currency;
  const today = todayIso();

  const live = (bookings ?? []).filter((b) => b.status === "confirmed" || b.status === "pending");
  const margin = live.reduce((sum, b) => sum + (b.sell - b.cost), 0);
  // Arrivals inside a fortnight: far enough ahead to act on, near enough to matter.
  const arrivals = live
    .filter((b) => b.checkIn >= today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 5);
  const openQuotes = (quotes ?? []).filter((q) => q.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader
        // Not "good morning": a greeting fixed at build time is wrong for
        // most of the day, and reading the clock during a render is both
        // impure and pointless when the sentence works without it.
        title={t("agency.welcomeBack", { name: context.session.name.split(" ")[0] })}
        description={t("agency.dashboardBody")}
        actions={
          <Link href={href(locale, "/agency/search")}>
            <Button>
              <Icon name="search" size={16} />
              {t("agency.searchStays")}
            </Button>
          </Link>
        }
      />

      {!bookings && <StatSkeleton />}
      {bookings && (
        <StatGrid>
          <Stat
            icon="tag"
            label={t("agency.creditAvailable")}
            value={
              <Money
                amount={context.balance?.available ?? 0}
                currency={currency}
                locale={locale}
                size="lg"
                className="text-xl"
              />
            }
            hint={t("agency.creditTerms", { days: context.agency.credit.paymentDays })}
          />
          <Stat icon="plane" label={t("agency.liveBookings")} value={String(live.length)} hint={t("agency.liveBookingsHint")} />
          <Stat
            icon="receipt"
            label={t("agency.openQuotes")}
            value={String(openQuotes.length)}
            hint={t("agency.openQuotesHint")}
          />
          <Stat
            icon="star"
            label={t("agency.marginToDate")}
            value={<Money amount={margin} currency={currency} locale={locale} size="lg" className="text-xl" />}
            tone={margin > 0 ? "positive" : "default"}
            hint={t("agency.marginHint")}
          />
        </StatGrid>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title={t("agency.arrivals")}
          description={t("agency.arrivalsBody")}
          actions={
            <Link href={href(locale, "/agency/bookings")} className="text-brand-700 text-sm underline">
              {t("agency.viewAll")}
            </Link>
          }
        >
          {!bookings && <TableSkeleton rows={3} />}
          {bookings && !arrivals.length && (
            <Nothing
              icon="plane"
              title={t("agency.noArrivals")}
              body={t("agency.noArrivalsBody")}
              action={
                <Link href={href(locale, "/agency/search")}>
                  <Button size="sm">{t("agency.searchStays")}</Button>
                </Link>
              }
            />
          )}
          {bookings && arrivals.length > 0 && (
            <Card className="divide-ink-100 divide-y">
              {arrivals.map((booking) => {
                const days = Math.round(
                  (new Date(booking.checkIn).getTime() - new Date(today).getTime()) / 86_400_000,
                );
                return (
                  <Link
                    key={booking.reference}
                    href={href(locale, `/agency/bookings/${booking.reference}`)}
                    className="hover:bg-brand-50/40 flex items-center justify-between gap-3 p-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{booking.hotelName}</p>
                      <p className="text-muted truncate text-xs">
                        {booking.leadGuest} · {formatDate(booking.checkIn, locale)}
                      </p>
                    </div>
                    {/* Urgency, not a date: "in 2 days" is read faster than a date. */}
                    <Badge tone={days <= 2 ? "caution" : "neutral"}>
                      {days === 0 ? t("agency.today") : t("agency.inDays", { n: days })}
                    </Badge>
                  </Link>
                );
              })}
            </Card>
          )}
        </Section>

        <Section
          title={t("agency.quotesToChase")}
          description={t("agency.quotesToChaseBody")}
          actions={
            <Link href={href(locale, "/agency/quotes")} className="text-brand-700 text-sm underline">
              {t("agency.viewAll")}
            </Link>
          }
        >
          {!quotes && <TableSkeleton rows={3} />}
          {quotes && !openQuotes.length && (
            <Nothing
              icon="receipt"
              title={t("agency.noOpenQuotes")}
              body={t("agency.noOpenQuotesBody")}
              action={
                <Link href={href(locale, "/agency/search")}>
                  <Button size="sm" variant="secondary">
                    {t("agency.newQuote")}
                  </Button>
                </Link>
              }
            />
          )}
          {quotes && openQuotes.length > 0 && (
            <Card className="divide-ink-100 divide-y">
              {openQuotes.slice(0, 5).map((quote) => {
                const total = quote.items.reduce((sum, item) => sum + item.sell, 0);
                const daysLeft = Math.round(
                  (new Date(quote.validUntil).getTime() - new Date(today).getTime()) / 86_400_000,
                );
                return (
                  <Link
                    key={quote.id}
                    href={href(locale, `/agency/quotes/${quote.id}`)}
                    className="hover:bg-brand-50/40 flex items-center justify-between gap-3 p-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{quote.customerName}</p>
                      <p className="text-muted truncate text-xs">
                        {quote.items.length} × {t("common.room")} · {quote.reference}
                      </p>
                    </div>
                    <div className="text-end">
                      <Money amount={total} currency={quote.currency} locale={locale} />
                      <p className={cx("text-xs", daysLeft <= 1 ? "text-caution-700" : "text-muted")}>
                        {daysLeft <= 0 ? t("agency.expiresToday") : t("agency.expiresInDays", { n: daysLeft })}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </Card>
          )}
        </Section>
      </div>

      <Section title={t("agency.yourTerms")} description={t("agency.yourTermsBody")}>
        <StatGrid columns={3}>
          <Stat label={t("agency.commission")} value={`${context.agency.commissionPercent}%`} hint={t("agency.commissionShort")} />
          <Stat
            label={t("agency.markup")}
            value={
              context.agency.markup.default.mode === "percent"
                ? `${context.agency.markup.default.value}%`
                : <Money amount={context.agency.markup.default.value} currency={currency} locale={locale} size="lg" />
            }
            hint={
              context.agency.markup.overrides.length
                ? t("agency.overrideCount", { n: context.agency.markup.overrides.length })
                : t("agency.markupShort")
            }
          />
          <Stat
            label={t("agency.creditLimit")}
            value={<Money amount={context.agency.credit.limit} currency={currency} locale={locale} size="lg" className="text-xl" />}
            hint={t("agency.creditTerms", { days: context.agency.credit.paymentDays })}
          />
        </StatGrid>
      </Section>
    </div>
  );
}
