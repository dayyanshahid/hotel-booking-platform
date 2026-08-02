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
import { dayLabel } from "@/lib/i18n";
import { href, searchParamsFromIntent } from "@/lib/nav";
import { attentionItems, type AttentionItem } from "@/lib/agency/attention";
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

/**
 * A row in "Needs you today".
 *
 * Each kind states the consequence rather than the status. "On hold" is a
 * state; "the room goes back in 40 minutes" is the reason to act, and it is
 * the second one that gets somebody to click.
 */
function AttentionRow({
  item,
  locale,
  currency,
}: {
  item: AttentionItem;
  locale: Locale;
  currency: string;
}) {
  const { t } = useApp();
  const { booking, kind } = item;

  const tone =
    kind === "stalled" ? "critical" : kind === "unconfirmed" ? "caution" : item.at < 3_600_000 ? "critical" : "caution";

  const detail =
    kind === "hold"
      ? item.at <= 0
        ? t("agency.holdReleasingNow")
        : t("agency.holdReleasesIn", { when: untilLabel(item.at, t, locale) })
      : kind === "unconfirmed"
        ? t("agency.cancellationUnconfirmedBody")
        : t("agency.bookingStalledBody");

  return (
    <Link
      href={href(locale, `/agency/bookings/${booking.reference}`)}
      className="hover:bg-brand-50/40 flex flex-wrap items-center justify-between gap-3 p-3.5 transition-colors"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* `tag` is this page's mark for money, which is what an unconfirmed
            cancellation is holding on to. */}
        <Icon
          name={kind === "hold" ? "clock" : kind === "unconfirmed" ? "tag" : "alert"}
          size={18}
          className={tone === "critical" ? "text-critical-700" : "text-caution-700"}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{booking.hotelName}</p>
          <p className="text-muted truncate text-xs">
            {booking.leadGuest} · {booking.reference}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={tone === "critical" ? "critical" : "caution"}>{detail}</Badge>
        <Money amount={booking.sell} currency={currency} locale={locale} size="sm" />
      </div>
    </Link>
  );
}

/**
 * How long is left, in the largest unit that is still useful.
 *
 * Minutes past an hour are noise when there are nine hours to go, and hours
 * are uselessly coarse when there are twenty minutes — the point of the label
 * is to make somebody act now or later, and those are different sentences.
 */
function untilLabel(
  ms: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: Locale,
): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 90) return t("agency.minutesShort", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 36) return t("agency.hoursShort", { n: hours });
  const days = Math.round(hours / 24);
  return t("agency.daysShort", { n: days, unit: dayLabel(t as never, days, locale) });
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
  /**
   * The load did not work.
   *
   * Held separately from "not loaded yet", because they look identical from
   * here and must not look identical on screen. Without this the fetch could
   * reject — the API down, the origin refusing the cookie — and `bookings`
   * stayed null for ever, so the page sat showing skeletons that were never
   * going to resolve into anything. An agent reads that as slow, waits, and
   * eventually reloads; nothing ever tells them it is broken.
   */
  const [failed, setFailed] = useState(false);
  /** Bumped by the retry button to re-run the effect. */
  const [reloads, setReloads] = useState(0);
  /**
   * Re-read on a timer so the countdowns below are honest.
   *
   * A hold expiring "in 40 minutes" that says so for the next three hours is
   * worse than no countdown, so this also drives the clock rather than only
   * the data.
   */
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [b, q] = await Promise.all([
          fetch(apiUrl("/api/agency/bookings"), { credentials: apiCredentials() }).then((r) => r.json()),
          fetch(apiUrl("/api/agency/quotes"), { credentials: apiCredentials() }).then((r) => r.json()),
        ]);
        if (!alive) return;
        // A refusal is as much a failure as a thrown fetch: an empty list from
        // a 401 reads on screen as an agency with no bookings.
        if (!b?.ok || !q?.ok) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setBookings(b.data.bookings);
        setQuotes(q.data.quotes);

        const now = new Date();
        const month = (offset: number) =>
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
        setMonths({ thisMonth: month(0), lastMonth: month(-1) });
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setTick(Date.now());
      }
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
  }, [reloads]);

  const currency = context.balance?.currency ?? context.agency.credit.currency;
  const today = todayIso();

  const live = (bookings ?? []).filter((b) => b.status === "confirmed" || b.status === "pending");
  const margin = live.reduce((sum, b) => sum + (b.sell - b.cost), 0);

  /**
   * Holds, which are neither live nor finished.
   *
   * A hold is a real supplier booking on a refundable rate, reserving the
   * agency's credit, that something will cancel unless somebody issues it.
   * Counting it as live overstates the book; leaving it out entirely — which
   * is what happened — makes the single most time-critical thing on the
   * account invisible on the screen an agent opens first. It gets its own
   * figure and, below, its own countdown.
   */
  const holds = (bookings ?? [])
    .filter((b) => b.status === "held")
    .sort((a, b) => (a.holdExpiresAt ?? "").localeCompare(b.holdExpiresAt ?? ""));

  // Work that does not wait, soonest first. Derived against `tick` so the
  // countdowns move with the poll rather than freezing at first paint.
  const attention = attentionItems(bookings ?? [], tick);

  /*
   * Arrivals inside a fortnight: far enough ahead to act on, near enough to
   * matter. The bound is applied rather than only described — without it this
   * was "the next five arrivals whenever they are", which on a quiet account
   * is a list of stays four months out presented as though they need doing.
   */
  const fortnight = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const arrivals = live
    .filter((b) => b.checkIn >= today && b.checkIn <= fortnight)
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

      {/*
        The load failed, said so, and offers the way out.
        Anything below this point renders from `bookings`, so without this the
        whole page is skeletons for ever and reads as merely slow.
      */}
      {failed && (
        <Card className="border-caution-300 bg-caution-50 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">{t("agency.dashboardUnavailable")}</p>
            <p className="text-muted text-xs">{t("agency.dashboardUnavailableBody")}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setReloads((n) => n + 1)}>
            {t("common.retry")}
          </Button>
        </Card>
      )}

      {/*
        Work that does not wait, above everything else on the page.
        Absent entirely when there is none — an empty "nothing needs you"
        panel every morning teaches an agent to stop looking at this spot,
        which is the one place something urgent will eventually appear.
      */}
      {attention.length > 0 && (
        <Section title={t("agency.needsYou")} description={t("agency.needsYouBody")}>
          <Card className="divide-ink-100 divide-y">
            {attention.slice(0, 6).map((item) => (
              <AttentionRow key={`${item.kind}-${item.booking.reference}`} item={item} locale={locale} currency={currency} />
            ))}
          </Card>
        </Section>
      )}

      {!bookings && !failed && <StatSkeleton />}
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
            /*
             * What is already committed, alongside what is left.
             *
             * The balance has always carried `used` and `heldAmount` and the
             * page showed neither, so an agency near its limit saw a number
             * getting smaller with nothing to say where it had gone — and
             * money tied up in holds, which is the part they can get back by
             * issuing or releasing, was indistinguishable from money owed.
             */
            hint={
              context.balance
                ? context.balance.heldAmount > 0
                  ? t("agency.creditUsedWithHolds", {
                      used: formatMoney(context.balance.used, currency as CurrencyCode, locale),
                      held: formatMoney(context.balance.heldAmount, currency as CurrencyCode, locale),
                    })
                  : t("agency.creditUsedOf", {
                      used: formatMoney(context.balance.used, currency as CurrencyCode, locale),
                      limit: formatMoney(context.balance.limit, currency as CurrencyCode, locale),
                    })
                : t("agency.creditTerms", {
                    days: context.agency.credit.paymentDays,
                    unit: dayLabel(t as never, context.agency.credit.paymentDays, locale),
                  })
            }
          />
          <Stat icon="plane" label={t("agency.liveBookings")} value={String(live.length)} hint={t("agency.liveBookingsHint")} />
          {/*
            Holds take the quotes slot when there are any.
            Both matter, and four figures is the row; a hold releases itself
            within hours and an unanswered quote sits there for days, so when
            they compete the clock wins. Quotes keep their own panel below.
          */}
          {holds.length > 0 ? (
            <Stat
              icon="clock"
              label={t("agency.onHold")}
              value={String(holds.length)}
              tone="caution"
              hint={t("agency.onHoldHint")}
            />
          ) : (
            <Stat
              icon="receipt"
              label={t("agency.openQuotes")}
              value={String(openQuotes.length)}
              hint={t("agency.openQuotesHint")}
            />
          )}
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
                      {days === 0 ? t("agency.today") : t("agency.inDays", { n: days, unit: dayLabel(t as never, days, locale) })}
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
                        {daysLeft <= 0
                          ? t("agency.expiresToday")
                          : t("agency.expiresInDays", { n: daysLeft, unit: dayLabel(t as never, daysLeft, locale) })}
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
            hint={t("agency.creditTerms", {
                    days: context.agency.credit.paymentDays,
                    unit: dayLabel(t as never, context.agency.credit.paymentDays, locale),
                  })}
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
