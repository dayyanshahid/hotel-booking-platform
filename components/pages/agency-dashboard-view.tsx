"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import type { AgencyContext } from "@/components/agency/use-agency";
import { Money, Nothing, PageHeader, Section, Stat, StatGrid, StatSkeleton, TableSkeleton } from "@/components/agency/ui";
import { Badge, Button, Card, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { SearchBar } from "@/components/search/search-bar";
import { formatDate, formatDateTime, formatMoney, todayIso } from "@/lib/format";
import { href, searchParamsFromIntent } from "@/lib/nav";
import type { AgencyBooking, AgencyQuote } from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

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
  const router = useRouter();
  const [bookings, setBookings] = useState<AgencyBooking[] | null>(null);
  const [quotes, setQuotes] = useState<AgencyQuote[] | null>(null);
  /*
   * Month boundaries, computed once when the data lands rather than during a
   * render — reading the clock while rendering is impure, and these change
   * once a month.
   */
  const [months, setMonths] = useState<{ thisMonth: string; lastMonth: string } | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const [b, q] = await Promise.all([
        fetch(apiUrl("/api/agency/bookings"), { credentials: apiCredentials() }).then((r) => r.json()),
        fetch(apiUrl("/api/agency/quotes"), { credentials: apiCredentials() }).then((r) => r.json()),
      ]);
      if (!alive) return;
      setBookings(b.ok ? b.data.bookings : []);
      setQuotes(q.ok ? q.data.quotes : []);

      const now = new Date();
      const month = (offset: number) =>
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
      setMonths({ thisMonth: month(0), lastMonth: month(-1) });
    }

    void load();
    /*
     * Re-read every half minute so the ticker is actually live.
     *
     * A poll rather than a socket: a counter has several agents on the same
     * account and the useful thing is noticing a colleague's booking within a
     * minute, which does not justify holding a connection open per desk.
     */
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
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

  /**
   * Production this month against last, on the same day-count basis.
   *
   * Comparing a part-month against a whole one flatters or damns an agency for
   * nothing, so last month is counted only as far through as today — the tenth
   * against the tenth. A comparison that cannot be trusted is worse on a
   * dashboard than no comparison at all.
   */
  const sales = (() => {
    if (!bookings || !months) return null;
    const dayOfMonth = Number(todayIso().slice(8, 10));
    const sold = (prefix: string, capDay: number) =>
      bookings
        .filter((b) => b.status !== "cancelled" && b.status !== "failed")
        .filter((b) => b.createdAt.slice(0, 7) === prefix && Number(b.createdAt.slice(8, 10)) <= capDay)
        .reduce(
          (acc, b) => ({ count: acc.count + 1, sell: acc.sell + b.sell, margin: acc.margin + (b.sell - b.cost) }),
          { count: 0, sell: 0, margin: 0 },
        );
    return { current: sold(months.thisMonth, 31), previous: sold(months.lastMonth, dayOfMonth) };
  })();

  /**
   * What has happened on this account lately.
   *
   * Newest first and across every agent, because the thing worth knowing at a
   * counter is what a colleague just did — a hold placed on the room you were
   * about to sell, a booking issued while you were on the phone.
   */
  const activity = [...(bookings ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

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

      {/*
        Search, on the page an agent lands on.
        The first thing they do is look for a room, and making them click
        through to another screen to start is a step that buys nothing.
      */}
      <Card className="p-4">
        <SearchBar
          variant="panel"
          currency={currency as CurrencyCode}
          onSearch={(intent) =>
            router.push(`${href(locale, "/agency/search")}?${searchParamsFromIntent(intent).toString()}`)
          }
        />
      </Card>

      {sales && (
        <Section title={t("agency.production")} description={t("agency.productionBody")}>
          <StatGrid>
            <Stat
              icon="receipt"
              label={t("agency.bookingsThisMonth")}
              value={String(sales.current.count)}
              hint={t("agency.versusLastMonth", { n: sales.previous.count })}
            />
            <Stat
              icon="tag"
              label={t("agency.salesThisMonth")}
              value={
                <Money amount={sales.current.sell} currency={currency} locale={locale} size="lg" className="text-xl" />
              }
              hint={t("agency.versusLastMonthAmount", {
                amount: formatMoney(sales.previous.sell, currency as CurrencyCode, locale),
              })}
            />
            <Stat
              icon="star"
              label={t("agency.marginThisMonth")}
              value={
                <Money
                  amount={sales.current.margin}
                  currency={currency}
                  locale={locale}
                  size="lg"
                  className="text-xl"
                />
              }
              tone={sales.current.margin > 0 ? "positive" : "default"}
              hint={t("agency.versusLastMonthAmount", {
                amount: formatMoney(sales.previous.margin, currency as CurrencyCode, locale),
              })}
            />
            <Stat
              icon="check"
              label={t("agency.averageMargin")}
              value={
                sales.current.sell > 0
                  ? `${Math.round((sales.current.margin / sales.current.sell) * 100)}%`
                  : "—"
              }
              hint={t("agency.averageMarginHint")}
            />
          </StatGrid>
        </Section>
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

      {/*
        What the account has been doing, newest first.
        Across every agent on purpose: the useful thing at a counter is seeing
        what a colleague just did — a hold placed on the room you were about to
        sell, a booking issued while you were on the phone. Re-read every thirty
        seconds, which is a poll and not a socket, because noticing within a
        minute is enough and a connection per desk is not worth holding open.
      */}
      <Section title={t("agency.activity")} description={t("agency.activityBody")}>
        {!bookings && <TableSkeleton rows={3} />}
        {bookings && !activity.length && (
          <Nothing icon="receipt" title={t("agency.noActivity")} body={t("agency.noActivityBody")} />
        )}
        {bookings && activity.length > 0 && (
          <Card className="divide-ink-100 divide-y">
            {activity.map((booking) => (
              <Link
                key={booking.reference}
                href={href(locale, `/agency/bookings/${booking.reference}`)}
                className="hover:surface-sunken flex flex-wrap items-center justify-between gap-3 p-3.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium wrap-anywhere">
                    {booking.hotelName}
                    <span className="text-muted"> · {booking.leadGuest}</span>
                  </p>
                  <p className="text-muted text-xs">
                    {booking.agentName} · {formatDateTime(booking.createdAt, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      booking.status === "confirmed"
                        ? "positive"
                        : booking.status === "held"
                          ? "caution"
                          : booking.status === "cancelled" || booking.status === "failed"
                            ? "neutral"
                            : "caution"
                    }
                  >
                    {t(`agency.status${booking.status.charAt(0).toUpperCase()}${booking.status.slice(1)}`)}
                  </Badge>
                  <Money amount={booking.sell} currency={currency} locale={locale} size="sm" />
                </div>
              </Link>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
