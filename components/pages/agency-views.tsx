"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { useResource } from "@/components/providers/use-resource";
import { PortalShell } from "@/components/agency/portal-shell";
import { refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Select, Toggle, cx } from "@/components/ui";
import { arrivalBucket, bookingTotals } from "@/lib/agency/book";
// From the policy module, not `holds.ts`: that one is server-only and
// importing it here would throw the moment this component hydrated.
import { hoursLeftOnHold, isHoldUrgent } from "@/lib/agency/hold-policy";
import { DataTable, LoadFailed, Money, Nothing, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { Icon, type IconName } from "@/components/ui/icons";
import { DocumentBrand, DocumentFooter } from "@/components/agency/document-brand";
import { DEFAULT_BRAND_COLOR, brandingOf, normalizeHex } from "@/lib/agency/branding";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import { canAtLeast, capabilitiesOf } from "@/lib/agency/types";
import { allocatableBy, allocatedToChildren, descendantsOf, poolOf } from "@/lib/agency/subagents";
import type {
  Agent,
  AgentCapabilities,
  AgentPermission,
  AgencyBooking,
  AgencyProfile,
  LedgerEntry,
  MarkupOverride,
  MarkupPolicy,
  MarkupRule,
} from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";
import { bookingLabel, dayLabel, hourLabel, minuteLabel } from "@/lib/i18n";

/** One label for a permission, wherever it is shown. */
function permissionLabel(t: (key: string) => string, permission: AgentPermission): string {
  return permission === "viewOnly"
    ? t("agency.permissionViewOnly")
    : permission === "booking"
      ? t("agency.permissionBooking")
      : t("agency.permissionIssue");
}

/* ------------------------------------------------------------- sign-in */

/**
 * Agent sign-in.
 *
 * Same two steps as the consumer flow — address, then a code — because an
 * agency counter is a shared machine and a password on a shared machine is a
 * password on a sticky note.
 *
 * Laid out as a canvas and a form rather than a card floating on a tinted
 * page. This is the one screen a prospective agency sees before they have an
 * account, and the one their staff open every morning: it should say what is
 * behind the door, and then get out of the way of the two fields that open it.
 */
export function AgencySignInView({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Seconds until another code may be asked for. Zero means "ask away". */
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  /*
   * The code field takes focus the moment it exists.
   *
   * An agent signing in every morning should be able to type their address,
   * press Enter, and type the code without touching the mouse. Landing on the
   * step with nothing focused breaks that halfway through.
   */
  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl("/api/agency/session"), {
      method: "POST",
      credentials: apiCredentials(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { demoCode?: string; codeRequired?: boolean };
    };
    setBusy(false);
    if (!body.ok) {
      setError(t("error.validation"));
      return;
    }
    /*
     * A view-only account is signed straight in.
     *
     * The code protects what a session can spend, and this one can spend
     * nothing — asking for it would be a step with nothing behind it. The
     * server decides, not this screen: it is the same rule that lets the
     * account in, so the two cannot disagree.
     */
    if (body.data?.codeRequired === false) {
      await verify();
      return;
    }
    setStage("code");
    setCooldown(30);
    // Demo environment only — the endpoint returns the code so the flow can be
    // walked without a mailbox. A real deployment sends it and returns nothing.
    setHint(body.data?.demoCode ?? null);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const body = await apiFetch<unknown>("/api/agency/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("account.codeInvalid"));
      return;
    }
    refreshAgency();
    // A full navigation, not a router push: the session cookie has just been
    // set and every cached client fetch above it is now stale.
    window.location.assign(href(locale, "/agency"));
  }

  /** Back to the first step with the address intact, for a typo in it. */
  function changeEmail() {
    setStage("email");
    setCode("");
    setHint(null);
    setError(null);
  }

  return (
    /*
     * A contained sheet rather than a full-bleed split.
     *
     * The layout above caps every page at a reading measure, and fighting that
     * with negative margins gives an edge-to-edge panel on one screen and a
     * lopsided one on the next. Bounded, the split reads as a deliberate object
     * on the page instead of a layout that escaped.
     */
    <div className="mx-auto w-full max-w-5xl py-2 sm:py-6">
      <div className="surface hairline grid overflow-hidden rounded-[var(--radius-sheet)] border shadow-[var(--shadow-card)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
        <SignInCanvas />

        {/*
          No card around the form. The split is already the separation, and a
          second outline inside it would be a box drawn on a box — costing the
          two fields the room they have to breathe in.
        */}
        <div className="flex items-center justify-center px-5 py-10 sm:px-10 sm:py-12">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-2 lg:hidden">
              <Wordmark />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold">{t("agency.signIn")}</h1>
              <p className="text-muted text-sm leading-relaxed">{t("agency.signInBody")}</p>
            </div>

            {error && <Alert tone="critical">{error}</Alert>}

            {/*
              A real form, so Enter submits.
              Everybody types their address and hits Enter. Without this the key
              did nothing at all, on the one screen where reaching for the mouse
              is most obviously a waste of a keystroke.
            */}
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                if (stage === "email") {
                  if (email) void send();
                } else if (code) {
                  void verify();
                }
              }}
            >
              {stage === "email" ? (
                <>
                  <Field label={t("agency.workEmail")} htmlFor="agency-email">
                    <Input
                      id="agency-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@agency.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Button type="submit" loading={busy} disabled={!email} className="w-full">
                    {t("agency.sendCode")}
                  </Button>
                </>
              ) : (
                <>
                  {/*
                    The address as a fact you can correct, not a greyed-out box.
                    A disabled field says "this is over"; the commonest reason to
                    look at it here is having mistyped it.
                  */}
                  <div className="surface hairline flex items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3.5 py-2.5">
                    <span className="min-w-0 truncate text-sm">{email}</span>
                    <button
                      type="button"
                      onClick={changeEmail}
                      className="text-brand-600 shrink-0 text-sm font-medium underline underline-offset-2"
                    >
                      {t("agency.changeEmail")}
                    </button>
                  </div>

                  <p className="text-muted text-sm">{t("agency.codeSent")}</p>

                  <Field label={t("agency.code")} htmlFor="agency-code">
                    <Input
                      id="agency-code"
                      ref={codeRef}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="text-center font-mono text-lg tracking-[0.4em]"
                    />
                  </Field>

                  {/*
                    A demo affordance, dressed as one.
                    It used to be an info alert, which is the same shape this app
                    uses to tell an agent something has gone wrong with a rate.
                    Nothing here is wrong: this deployment has no mailbox, so it
                    hands the code over and offers to type it for you.
                  */}
                  {hint && (
                    <div className="surface-sunken flex items-center justify-between gap-3 rounded-[var(--radius-control)] px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-muted text-[11px] font-medium tracking-wide uppercase">
                          {t("agency.demoCodeLabel")}
                        </p>
                        <p className="font-mono text-sm tracking-[0.2em]">{hint}</p>
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setCode(hint)}>
                        {t("agency.useCode")}
                      </Button>
                    </div>
                  )}

                  <Button type="submit" loading={busy} disabled={!code} className="w-full">
                    {t("agency.verify")}
                  </Button>

                  {/*
                    A code that never arrives is otherwise a dead end — the only
                    way out is a reload, which loses the address as well.
                  */}
                  <p className="text-muted text-center text-sm">
                    {cooldown > 0 ? (
                      t("agency.resendIn", { seconds: cooldown })
                    ) : (
                      <button type="button" onClick={() => void send()} className="underline underline-offset-2">
                        {t("agency.resendCode")}
                      </button>
                    )}
                  </p>
                </>
              )}
            </form>

            <div className="hairline border-t pt-5">
              <Link href={href(locale, "/")} className="text-muted text-sm underline underline-offset-2">
                {t("agency.notAgent")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The half of the screen that is not a form.
 *
 * Deliberately dark, and deliberately the only dark surface in the app. The
 * chrome band was taken off every other page because a dark strip across the
 * top is what dates a design; a full canvas behind a sign-in is a different
 * object, and it is the one moment where the brand should be the loudest thing
 * on screen rather than a wordmark in the corner.
 *
 * What it says is three things the portal actually does, not adjectives. An
 * agency deciding whether to open an account, and a new starter on their first
 * morning, are both better served by "hold a room before you commit" than by
 * anything with the word "seamless" in it.
 */
function SignInCanvas() {
  const { t } = useApp();
  const points: { icon: IconName; text: string }[] = [
    { icon: "tag", text: t("agency.pitchRates") },
    { icon: "card", text: t("agency.pitchCredit") },
    { icon: "clock", text: t("agency.pitchHold") },
  ];

  return (
    <div className="text-ink-100 bg-ink-950 relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
      {/*
        One warm bloom off the leading edge, keyed to the brand.

        Flat ink behind white type is a slab; this gives the panel a light
        source for the price of a gradient. Drawn as its own element rather
        than a background on the panel because a gradient position is physical
        — `at 0% 0%` is the top *left* whatever the writing direction — and in
        Arabic that put the light on the far side from the wordmark it is meant
        to be lifting. Logical inset properties flip; gradient stops do not.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 start-0 size-[36rem] -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgb(242 98 27 / 0.30) 0%, rgb(242 98 27 / 0.10) 45%, transparent 75%)",
        }}
      />

      <Wordmark tone="inverse" showSince className="relative" />

      <div className="relative max-w-md space-y-8 py-10">
        <h2 className="text-3xl font-bold leading-tight xl:text-4xl">{t("agency.pitchTitle")}</h2>
        <ul className="space-y-4">
          {points.map((point) => (
            <li key={point.icon} className="flex items-start gap-3">
              <span className="bg-brand-500/15 text-brand-300 mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)]">
                <Icon name={point.icon} size={16} />
              </span>
              <span className="text-ink-200 text-[15px] leading-relaxed">{point.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-ink-400 relative text-xs">{t("agency.pitchFoot")}</p>
    </div>
  );
}

/* --------------------------------------------------------- credit panel */

/**
 * The credit line, shown as a bar.
 *
 * A number on its own does not answer "can I book this one?" — the proportion
 * does, at a glance, which is the question an agent actually has.
 */
function CreditPanel({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const balance = context.balance;
  if (!balance) return null;
  const currency = balance.currency as CurrencyCode;
  const used = balance.limit > 0 ? Math.min(1, balance.used / balance.limit) : 0;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted text-xs">{t("agency.creditAvailable")}</p>
          <p className="text-2xl font-bold">{formatMoney(balance.available, currency, locale)}</p>
        </div>
        <p className="text-muted text-sm">
          {t("agency.creditUsed")} {formatMoney(balance.used, currency, locale)} ·{" "}
          {t("agency.creditLimit")} {formatMoney(balance.limit, currency, locale)}
        </p>
      </div>
      <div className="bg-ink-100 h-2 w-full overflow-hidden rounded-full">
        <div
          className={cx("h-full rounded-full", used > 0.9 ? "bg-critical-600" : "bg-brand-600")}
          style={{ width: `${Math.round(used * 100)}%` }}
        />
      </div>
      <p className="text-muted text-xs">{t("agency.creditTerms", { days: context.agency.credit.paymentDays, unit: dayLabel(t as never, context.agency.credit.paymentDays, locale) })}</p>
    </Card>
  );
}

/* ------------------------------------------------------------ bookings */

export function AgencyBookingsView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{() => <BookingsPanel locale={locale} />}</PortalShell>;
}

/** How the book is narrowed, beyond a status. */
type BookView = "all" | "today" | "week" | "staying" | "holds" | "past";

function BookingsPanel({ locale }: { locale: Locale }) {
  const { t } = useApp();
  /*
   * `body.ok ? bookings : []` again, and the fetch was not wrapped at all —
   * so a refusal showed the agency an empty book, and a request that never
   * completed left the panel on a skeleton for ever.
   */
  const booked = useResource<{ bookings: AgencyBooking[] }>("/api/agency/bookings");
  const bookings = booked.data?.bookings ?? null;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  /**
   * Which slice of the book is on screen.
   *
   * The two questions that run a counter's day are who is arriving and what is
   * about to be given back, and the list could answer neither: check-in dates
   * were printed in a column that could not be sorted, filtered or counted, and
   * a hold — a real supplier booking that cancels itself unless somebody issues
   * it — looked exactly as settled as a confirmed sale.
   */
  const [view, setView] = useState<BookView>("all");

  const all = bookings ?? [];

  /** What each view holds, so a tab can say so before it is pressed. */
  const counts = useMemo(
    () => ({
      all: all.length,
      today: all.filter((b) => arrivalBucket(b) === "today").length,
      week: all.filter((b) => ["today", "week"].includes(arrivalBucket(b))).length,
      staying: all.filter((b) => arrivalBucket(b) === "staying").length,
      holds: all.filter((b) => b.status === "held").length,
      past: all.filter((b) => arrivalBucket(b) === "past").length,
    }),
    [all],
  );

  /** Holds close enough to release that somebody has to decide today. */
  const urgentHolds = useMemo(() => all.filter((b) => isHoldUrgent(b)).length, [all]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = all.filter((booking) => {
      if (status !== "all" && booking.status !== status) return false;
      if (view === "holds" ? booking.status !== "held" : view !== "all") {
        const bucket = arrivalBucket(booking);
        if (view === "week" ? !["today", "week"].includes(bucket) : bucket !== view) return false;
      }
      if (!needle) return true;
      return `${booking.reference} ${booking.hotelName} ${booking.leadGuest}`.toLowerCase().includes(needle);
    });

    /*
     * Sorted by the thing the view is about. Looking at arrivals, the soonest
     * comes first; looking at the whole book or at history, the newest sale
     * does — which is the order the endpoint already returns and the order a
     * general list wants.
     */
    if (view === "today" || view === "week" || view === "staying") {
      return [...filtered].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    }
    if (view === "holds") {
      // Soonest to be given back, first.
      return [...filtered].sort((a, b) => (a.holdExpiresAt ?? "9999").localeCompare(b.holdExpiresAt ?? "9999"));
    }
    return filtered;
  }, [all, query, status, view]);

  const totals = useMemo(() => bookingTotals(rows), [rows]);

  return (
    <div className="space-y-5">
      <PageHeader title={t("agency.bookings")} description={t("agency.bookingsBody")} />

      {/*
        The day's questions, as tabs.

        Above the search box rather than beside it, because searching is what
        an agent does when they already know the name — these are for the
        bookings they have not thought about yet.
      */}
      {bookings && bookings.length > 0 && (
        <div className="space-y-3">
          {urgentHolds > 0 && (
            /*
              A hold is a room already reserved that hands itself back unless
              somebody issues it. Said at the top, in the colour of a deadline,
              because it is the only thing on this screen with a clock running.
            */
            <Alert tone="warning" title={t("agency.holdsUrgent", { count: urgentHolds })}>
              <div className="flex flex-wrap items-center gap-3">
                <span>{t("agency.holdsUrgentBody")}</span>
                <Button size="sm" variant="secondary" onClick={() => setView("holds")}>
                  {t("agency.bookView.holds")}
                </Button>
              </div>
            </Alert>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(["all", "today", "week", "staying", "holds", "past"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={cx(
                  "rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium transition-colors",
                  view === key ? "bg-brand-600 text-white" : "surface-sunken text-muted hover:text-ink-900",
                )}
              >
                {t(`agency.bookView.${key}` as never)} {counts[key]}
              </button>
            ))}
          </div>

          {/* What the slice on screen is worth, once it is more than one row. */}
          {totals.count > 1 && (
            <p className="text-muted text-sm">
              {totals.count} {bookingLabel(t, totals.count, locale)} ·{" "}
              <Money amount={totals.sell} currency={rows[0]?.currency ?? "USD"} locale={locale} />
              <span className="text-muted"> · {t("agency.margin")} </span>
              <Money
                amount={totals.margin}
                currency={rows[0]?.currency ?? "USD"}
                locale={locale}
                tone="positive"
              />
            </p>
          )}
        </div>
      )}

      {/* Filters appear only once there is enough to be worth filtering. */}
      {bookings && bookings.length > 3 && (
        <Card className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr]">
          <Field label={t("admin.search")} htmlFor="bk-q">
            <Input
              id="bk-q"
              value={query}
              placeholder={t("agency.bookingSearch")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          <Field label={t("agency.statusLabel")} htmlFor="bk-status">
            <Select id="bk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{t("admin.allStatuses")}</option>
              <option value="confirmed">{t("agency.statusConfirmed")}</option>
              <option value="pending">{t("agency.statusPending")}</option>
              <option value="cancelled">{t("agency.statusCancelled")}</option>
            </Select>
          </Field>
        </Card>
      )}

      {!bookings && <TableSkeleton />}
      {bookings && !bookings.length && (
        <Nothing
          icon="plane"
          title={t("agency.noBookings")}
          body={t("agency.noBookingsBody")}
          action={
            <Link href={href(locale, "/agency")}>
              <Button>{t("agency.searchStays")}</Button>
            </Link>
          }
        />
      )}
      {bookings && bookings.length > 0 && <BookingTable locale={locale} bookings={rows} />}
    </div>
  );
}

/**
 * Time left on a hold, in the unit a person would say it in.
 *
 * Minutes when it is minutes, hours when it is hours, days beyond two — the
 * point of the badge is that it can be read at a glance down a column, and a
 * number that needs dividing by twenty-four is not glanceable.
 */
function holdCountdown(t: (key: never) => string, hoursLeft: number, locale: string): string {
  if (hoursLeft < 1) {
    const minutes = Math.max(1, Math.round(hoursLeft * 60));
    return `${minutes} ${minuteLabel(t, minutes, locale)}`;
  }
  if (hoursLeft < 48) {
    const hours = Math.round(hoursLeft);
    return `${hours} ${hourLabel(t, hours, locale)}`;
  }
  const days = Math.round(hoursLeft / 24);
  return `${days} ${dayLabel(t, days, locale)}`;
}

const BOOKING_TONE: Record<AgencyBooking["status"], "positive" | "caution" | "neutral" | "critical"> = {
  confirmed: "positive",
  pending: "caution",
  cancelled: "neutral",
  failed: "critical",
  held: "caution",
};

/** A status is a label, not a field name — Arabic should not read "cancelled". */
const BOOKING_STATUS: Record<AgencyBooking["status"], string> = {
  confirmed: "agency.statusConfirmed",
  pending: "agency.statusPending",
  cancelled: "agency.statusCancelled",
  failed: "agency.statusFailed",
  held: "agency.statusHeld",
};

/**
 * The book of business.
 *
 * A real table now rather than a stack of cards: five money columns are only
 * comparable when they line up, and they only line up in a table. It scrolls
 * inside its own box on a phone instead of collapsing into prose, and the two
 * least load-bearing columns drop out below `sm`.
 */
function BookingTable({ locale, bookings }: { locale: Locale; bookings: AgencyBooking[] }) {
  const { t } = useApp();
  return (
    <DataTable
      rows={bookings}
      rowKey={(booking) => booking.reference}
      minWidth={720}
      empty={<Nothing icon="search" title={t("agency.noMatches")} />}
      columns={[
        {
          key: "property",
          header: t("admin.property"),
          render: (booking) => (
            <div className="min-w-0">
              <Link
                href={href(locale, `/agency/bookings/${booking.reference}`)}
                className="font-medium wrap-anywhere hover:underline"
              >
                {booking.hotelName}
              </Link>
              <p className="text-muted font-mono text-xs">{booking.reference}</p>
            </div>
          ),
        },
        {
          key: "guest",
          header: t("agency.leadGuest"),
          secondary: true,
          render: (booking) => (
            <div className="min-w-0">
              <p className="wrap-anywhere">{booking.leadGuest}</p>
              <p className="text-muted text-xs wrap-anywhere">{booking.agentName}</p>
            </div>
          ),
        },
        {
          key: "stay",
          header: t("admin.stay"),
          render: (booking) => (
            <span className="whitespace-nowrap">
              {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
            </span>
          ),
        },
        {
          key: "status",
          header: t("agency.statusLabel"),
          render: (booking) => {
            /*
              A hold with the clock on it.

              Held looked exactly like confirmed in this column, and it is not:
              the room is really reserved and it hands itself back unless
              somebody issues it. The hours are the whole point — an agent
              scanning thirty rows needs to see which one goes tonight.
            */
            const left = hoursLeftOnHold(booking);
            return (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={BOOKING_TONE[booking.status]}>{t(BOOKING_STATUS[booking.status])}</Badge>
                {left !== null && left > 0 && (
                  <Badge tone={isHoldUrgent(booking) ? "critical" : "caution"}>
                    {/*
                      In the unit a person would use. Rounding everything to
                      hours printed "479h left" on a hold three weeks out, which
                      is twenty days expressed as a number the reader has to
                      divide. Hours are the right unit only while hours are what
                      is left.
                    */}
                    {holdCountdown(t, left, locale)}
                  </Badge>
                )}
              </span>
            );
          },
        },
        {
          key: "cost",
          header: t("agency.cost"),
          align: "end",
          secondary: true,
          render: (booking) => <Money amount={booking.cost} currency={booking.currency} locale={locale} />,
        },
        {
          key: "sell",
          header: t("agency.sell"),
          align: "end",
          render: (booking) => <Money amount={booking.sell} currency={booking.currency} locale={locale} />,
        },
        {
          key: "margin",
          header: t("agency.margin"),
          align: "end",
          render: (booking) => (
            <Money amount={booking.sell - booking.cost} currency={booking.currency} locale={locale} tone="positive" />
          ),
        },
      ]}
    />
  );
}

/* -------------------------------------------------------------- credit */

export function AgencyCreditView({ locale }: { locale: Locale }) {
  const { t } = useApp();
  return (
    <PortalShell locale={locale}>
      {(context) => (
        <div className="space-y-4">
          {/*
            The only portal page that had no page header, and so the only one
            whose outline began below the top. Every other screen here titles
            itself with `PageHeader`; this one went straight into its panels,
            each of which is a section heading with nothing above it.
          */}
          <PageHeader title={t("agency.credit")} description={t("agency.creditBody")} />
          <CreditPanel locale={locale} context={context} />
          <Periods locale={locale} />
          <Statement locale={locale} />
        </div>
      )}
    </PortalShell>
  );
}

interface StatementPeriod {
  month: string;
  charged: number;
  credited: number;
  settled: number;
  currency: string;
}

/**
 * The monthly view.
 *
 * An agency settles by month, so the question "what do we owe for June" has to
 * be answerable without adding up a ledger by eye. Charged and settled stay as
 * two columns rather than one net figure: an accounts clerk matching payments
 * needs to see what was invoiced and what has been paid against it.
 */
function Periods({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const statements = useResource<{ periods: StatementPeriod[] }>("/api/agency/statements");
  const periods = statements.data?.periods ?? null;

  if (statements.loading) return <TableSkeleton rows={3} />;
  /*
   * A failed read is not "no statements".
   *
   * This section hid itself entirely when the list was empty, which is right
   * for an agency that has not been invoiced yet and wrong for one whose
   * statements could not be fetched — same blank space, opposite meaning, and
   * the second is about money they are owed or owe.
   */
  if (statements.failed) {
    return <LoadFailed title={t("agency.statementsUnavailable")} onRetry={statements.reload} />;
  }
  if (!periods?.length) return null;

  return (
    <section className="space-y-2">
      <SectionHeading title={t("agency.periods")} description={t("agency.periodsBody")} />
      <DataTable
        rows={periods}
        rowKey={(period) => period.month}
        minWidth={560}
        columns={[
          { key: "month", header: t("agency.month"), render: (p) => <span className="font-medium">{p.month}</span> },
          {
            key: "charged",
            header: t("agency.charged"),
            align: "end",
            render: (p) => <Money amount={p.charged} currency={p.currency} locale={locale} />,
          },
          {
            key: "credited",
            header: t("agency.credited"),
            align: "end",
            secondary: true,
            render: (p) => <Money amount={p.credited} currency={p.currency} locale={locale} tone="muted" />,
          },
          {
            key: "settled",
            header: t("agency.settled"),
            align: "end",
            render: (p) => <Money amount={p.settled} currency={p.currency} locale={locale} />,
          },
          {
            key: "outstanding",
            header: t("agency.outstanding"),
            align: "end",
            render: (p) => (
              <Money
                amount={Math.max(0, p.charged - p.credited - p.settled)}
                currency={p.currency}
                locale={locale}
                tone={p.charged - p.credited - p.settled > 0 ? "default" : "muted"}
              />
            ),
          },
          {
            key: "csv",
            header: "",
            align: "end",
            render: (p) => (
              <a className="text-brand-700 text-xs underline" href={`/api/agency/statements?format=csv&month=${p.month}`}>
                CSV
              </a>
            ),
          },
        ]}
      />
    </section>
  );
}

const LEDGER_LABEL: Record<LedgerEntry["kind"], string> = {
  booking: "agency.ledgerBooking",
  cancellation: "agency.ledgerCancellation",
  settlement: "agency.ledgerSettlement",
  adjustment: "agency.ledgerAdjustment",
  hold: "agency.ledgerHold",
  holdRelease: "agency.ledgerHoldRelease",
};

function Statement({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const ledger = useResource<{ entries: LedgerEntry[] }>("/api/agency/ledger");
  const entries = ledger.data?.entries ?? null;

  return (
    <section className="space-y-3">
      <SectionHeading title={t("agency.statement")} description={t("agency.statementBody")} />
      {ledger.loading && <TableSkeleton rows={4} />}
      {ledger.failed && <LoadFailed title={t("agency.ledgerUnavailable")} onRetry={ledger.reload} />}
      {entries && !entries.length && <p className="text-muted text-sm">{t("agency.noMovements")}</p>}
      {entries && entries.length > 0 && (
        <Card className="divide-ink-100 divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(LEDGER_LABEL[entry.kind])}</p>
                <p className="text-muted text-xs wrap-anywhere">{entry.note}</p>
                <p className="text-muted text-xs">
                  {formatDateTime(entry.at, locale)}
                  {entry.reference ? ` · ${entry.reference}` : ""}
                </p>
              </div>
              <p
                className={cx(
                  "font-semibold tabular-nums",
                  entry.amount < 0 ? "text-critical-700" : "text-positive-700",
                )}
              >
                {entry.amount < 0 ? "−" : "+"}
                {formatMoney(Math.abs(entry.amount), entry.currency as CurrencyCode, locale)}
              </p>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- team */

export function AgencyTeamView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{(context) => <TeamPanel locale={locale} context={context} />}</PortalShell>;
}

function TeamPanel({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Agent["role"]>("agent");
  const [permission, setPermission] = useState<AgentPermission>("issue");
  const [mayHold, setMayHold] = useState(true);
  const [mayNonRefundable, setMayNonRefundable] = useState(true);
  const [allocation, setAllocation] = useState("");
  const [markupMode, setMarkupMode] = useState<"inherit" | "percent" | "fixed">("inherit");
  const [markupValue, setMarkupValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which row has its allocation and margin open for editing. One at a time. */
  const [editing, setEditing] = useState<string | null>(null);
  const isAdmin = context.session.role === "admin";

  /*
   * The list of people who may spend this agency's credit. Showing an empty
   * one because the read failed invites an administrator to re-invite
   * colleagues who are already there.
   */
  const team = useResource<{ agents: Agent[] }>("/api/agency/agents");
  const agents = team.data?.agents ?? null;
  const reload = team.reload;

  /*
   * Narrowed once, here. `CreditTerms.currency` is a plain string because it is
   * whatever an operator agreed with the agency, and every formatter on this
   * screen wants the catalogue union — casting at each call site would be the
   * same assertion made six times.
   */
  const currency = context.agency.credit.currency as CurrencyCode;
  const agencyLimit = context.agency.credit.limit;
  const me = agents?.find((a) => a.id === context.session.agentId) ?? null;

  /*
   * What is left to hand out, and to whom it belongs.
   *
   * An administrator shares the agency line; anybody else shares the slice they
   * were given. Computed here rather than fetched because the server enforces
   * the same rule from the same function — this is the number that stops
   * somebody typing an allocation only to have it refused.
   */
  const poolLeft = (excludeId?: string) =>
    me && agents ? allocatableBy(me, agents, agencyLimit, excludeId) : 0;

  /*
   * You cannot share a pool you were never given.
   *
   * The server says the same, but a form that lets somebody fill it in and then
   * refuses is a form that wasted their time and taught them nothing.
   */
  const canCreate = isAdmin || (me?.creditLimit !== undefined);

  function markupOf(mode: "inherit" | "percent" | "fixed", value: string): MarkupRule | undefined {
    if (mode === "inherit") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return { mode, value: parsed, currency: mode === "fixed" ? currency : undefined };
  }

  function resetForm() {
    setName("");
    setEmail("");
    setMayHold(true);
    setMayNonRefundable(true);
    setAllocation("");
    setMarkupMode("inherit");
    setMarkupValue("");
  }

  async function invite() {
    setBusy(true);
    setError(null);
    const body = await apiFetch<unknown>("/api/agency/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        role,
        permission,
        capabilities: { hold: mayHold, nonRefundable: mayNonRefundable },
        /*
         * Sent only when it was typed. An empty box means "no separate cap",
         * which is a real answer for a colleague at the top of the agency and
         * refused outright for a sub-agent — the server decides which, because
         * it is the same rule that governs every other way in.
         */
        ...(allocation.trim() ? { creditLimit: Number(allocation) } : {}),
        ...(markupOf(markupMode, markupValue) ? { markup: markupOf(markupMode, markupValue) } : {}),
      }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    resetForm();
    await reload();
  }

  /**
   * Change what someone may do, without touching whether they are active.
   *
   * This is the everyday action on this screen — a new starter goes to
   * view-only, an experienced agent is trusted with the credit line — and it
   * takes effect on their very next request, not when their session expires.
   */
  async function setPermissionFor(agent: Agent, next: AgentPermission) {
    await patch({ agentId: agent.id, permission: next });
  }

  /**
   * A right withdrawn without touching the rest of the account.
   *
   * Sent as a partial, one switch at a time, so flipping "may hold" cannot
   * silently rewrite whether the same person may sell non-refundable stock —
   * the two are separate grants and a screen that posts both on every change
   * would resurrect whichever one another admin had just removed.
   */
  async function setCapability(agent: Agent, right: keyof AgentCapabilities, next: boolean) {
    await patch({ agentId: agent.id, capabilities: { [right]: next } });
  }

  async function toggle(agent: Agent) {
    await patch({ agentId: agent.id, active: !agent.active });
  }

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await apiFetch<unknown>("/api/agency/agents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError(res.error?.message ?? t("error.validation"));
    await reload();
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("agency.subAgents")} description={t("agency.subAgentsBody")} />
      {error && <Alert tone="critical">{error}</Alert>}

      {/*
        The pool, before anybody types a number into a box.
        "You have 2,500 left to allocate" is the fact that makes the rest of
        this screen make sense; discovering it from a refusal does not.
      */}
      {me && agents && (
        <Card className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-4">
          <div>
            <p className="text-muted text-xs">{t("agency.poolYours")}</p>
            <Money amount={poolOf(me, agencyLimit)} currency={currency} locale={locale} size="lg" />
          </div>
          <div>
            <p className="text-muted text-xs">{t("agency.poolPromised")}</p>
            <Money amount={allocatedToChildren(me.id, agents)} currency={currency} locale={locale} />
          </div>
          <div>
            <p className="text-muted text-xs">{t("agency.poolLeft")}</p>
            <Money
              amount={poolLeft()}
              currency={currency}
              locale={locale}
              tone={poolLeft() > 0 ? "positive" : "muted"}
            />
          </div>
        </Card>
      )}

      {team.loading && <TableSkeleton rows={3} />}
      {/*
        A failed read here shows an empty team, and the reader's obvious next
        move is to re-invite colleagues who are already on the account — each
        one an email to somebody who does not need it and, worse, a second
        record for a person who already has the right to spend the credit.
      */}
      {team.failed && <LoadFailed title={t("agency.teamUnavailable")} onRetry={team.reload} />}
      {agents && (
        <Card className="divide-ink-100 divide-y">
          {agents.map((agent) => {
            const rights = capabilitiesOf(agent);
            const canBook = canAtLeast(agent.permission ?? "issue", "booking");
            const editable = isAdmin || descendantsOf(context.session.agentId, agents).some((a) => a.id === agent.id);
            const editableRights = editable && agent.id !== context.session.agentId && canBook;
            const manages = editable && agent.id !== context.session.agentId;
            const parent = agent.parentId ? agents.find((a) => a.id === agent.parentId) : undefined;
            return (
              <div key={agent.id} className="space-y-2 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 space-y-1.5">
                    <div>
                      <p className="text-sm font-medium wrap-anywhere">{agent.name}</p>
                      <p className="text-muted text-xs wrap-anywhere">
                        {agent.email}
                        {/* Who they answer to, said on their own row — a hierarchy
                            you have to reconstruct from a list is not a hierarchy. */}
                        {parent && <> · {t("agency.reportsTo")} {parent.name}</>}
                      </p>
                    </div>

                    {/*
                      Kept in the same column as the name, not on a strip of its
                      own beneath the row. These are facts about a person, and
                      read as a caption under their name in a way a full-width
                      band floating between two people does not.
                    */}
                    {editableRights ? (
                      <div className="-mb-1.5 flex flex-wrap items-center gap-x-5">
                        <Toggle
                          checked={rights.hold}
                          onChange={(next) => setCapability(agent, "hold", next)}
                          label={t("agency.mayHold")}
                        />
                        <Toggle
                          checked={rights.nonRefundable}
                          onChange={(next) => setCapability(agent, "nonRefundable", next)}
                          label={t("agency.mayBookNonRefundable")}
                        />
                      </div>
                    ) : (
                      /*
                       * Withheld rights are still stated on a row nobody can
                       * edit — an agent reading their own line needs to know why
                       * the hold button is missing, and no switches at all would
                       * read as no rule at all.
                       */
                      canBook &&
                      (!rights.hold || !rights.nonRefundable) && (
                        <div className="flex flex-wrap gap-1.5">
                          {!rights.hold && <Badge tone="neutral">{t("agency.mayNotHold")}</Badge>}
                          {!rights.nonRefundable && (
                            <Badge tone="neutral">{t("agency.mayNotBookNonRefundable")}</Badge>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* The two commercial facts, read at a glance across the list. */}
                    {agent.creditLimit !== undefined && (
                      <Badge tone="neutral">
                        {formatMoney(agent.creditLimit, currency, locale)}
                      </Badge>
                    )}
                    {agent.markup && (
                      <Badge tone="neutral">
                        {agent.markup.mode === "percent"
                          ? `+${agent.markup.value}%`
                          : /* A fixed rule carries the currency it was set in; the
                               agency's own is the fallback for older records. */
                            `+${formatMoney(agent.markup.value, (agent.markup.currency as CurrencyCode) ?? currency, locale)}`}
                      </Badge>
                    )}
                    <Badge tone={agent.role === "admin" ? "brand" : "neutral"}>
                      {agent.role === "admin" ? t("agency.roleAdmin") : t("agency.roleAgent")}
                    </Badge>
                    {manages ? (
                      <Select
                        aria-label={t("agency.permission")}
                        // Both bangs earn their keep: `CONTROL` sets `w-full` and
                        // `min-h-11`, and a plain `w-auto` loses to it on
                        // stylesheet order, which stacked the row into three lines.
                        className="!min-h-9 !w-auto"
                        value={agent.permission ?? "issue"}
                        onChange={(e) => setPermissionFor(agent, e.target.value as AgentPermission)}
                      >
                        <option value="viewOnly">{t("agency.permissionViewOnly")}</option>
                        <option value="booking">{t("agency.permissionBooking")}</option>
                        <option value="issue">{t("agency.permissionIssue")}</option>
                      </Select>
                    ) : (
                      <Badge tone="neutral">{permissionLabel(t, agent.permission ?? "issue")}</Badge>
                    )}
                    {!agent.active && <Badge tone="caution">{t("agency.suspended.badge")}</Badge>}
                    {manages && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(editing === agent.id ? null : agent.id)}
                        >
                          {editing === agent.id ? t("common.cancel") : t("agency.editAllocation")}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggle(agent)}>
                          {agent.active ? t("agency.suspend") : t("agency.restore")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editing === agent.id && (
                  <AllocationEditor
                    agent={agent}
                    currency={currency}
                    locale={locale}
                    ceiling={poolLeft(agent.id)}
                    onSave={async (patchBody) => {
                      await patch({ agentId: agent.id, ...patchBody });
                      setEditing(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </Card>
      )}

      {canCreate ? (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("agency.addSubAgent")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("agency.inviteName")} htmlFor="agent-name">
              <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("agency.workEmail")} htmlFor="agent-email">
              <Input id="agent-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {/*
              Only an administrator picks a role. A branch manager building
              their own desk is not choosing whether that person runs the
              agency — they are choosing what part of their own job to hand over.
            */}
            {isAdmin ? (
              <Field label={t("agency.role")} htmlFor="agent-role">
                <Select id="agent-role" value={role} onChange={(e) => setRole(e.target.value as Agent["role"])}>
                  <option value="agent">{t("agency.roleAgent")}</option>
                  <option value="admin">{t("agency.roleAdmin")}</option>
                </Select>
              </Field>
            ) : (
              <Field
                label={t("agency.creditAllocation")}
                htmlFor="agent-allocation"
                hint={t("agency.allocationHint", { amount: formatMoney(poolLeft(), currency, locale) })}
              >
                <Input
                  id="agent-allocation"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={poolLeft()}
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value)}
                />
              </Field>
            )}
            <Field
              label={t("agency.permission")}
              htmlFor="agent-permission"
              hint={
                permission === "viewOnly"
                  ? t("agency.permissionViewOnlyHelp")
                  : permission === "booking"
                    ? t("agency.permissionBookingHelp")
                    : t("agency.permissionIssueHelp")
              }
            >
              <Select
                id="agent-permission"
                value={permission}
                onChange={(e) => setPermission(e.target.value as AgentPermission)}
              >
                <option value="viewOnly">{t("agency.permissionViewOnly")}</option>
                <option value="booking">{t("agency.permissionBooking")}</option>
                <option value="issue">{t("agency.permissionIssue")}</option>
              </Select>
            </Field>
            {isAdmin && (
              <Field
                label={t("agency.creditAllocation")}
                htmlFor="agent-allocation-admin"
                hint={t("agency.allocationHint", { amount: formatMoney(poolLeft(), currency, locale) })}
              >
                <Input
                  id="agent-allocation-admin"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={poolLeft()}
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value)}
                />
              </Field>
            )}
            <Field label={t("agency.sellsAt")} htmlFor="agent-markup-mode">
              <div className="flex gap-2">
                <Select
                  id="agent-markup-mode"
                  className="!w-auto grow"
                  value={markupMode}
                  onChange={(e) => setMarkupMode(e.target.value as typeof markupMode)}
                >
                  <option value="inherit">{t("agency.markupInherit")}</option>
                  <option value="percent">{t("agency.markupPercent")}</option>
                  <option value="fixed">{t("agency.markupFixed")}</option>
                </Select>
                {markupMode !== "inherit" && (
                  <Input
                    aria-label={t("agency.sellsAt")}
                    className="!w-24"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={markupValue}
                    onChange={(e) => setMarkupValue(e.target.value)}
                  />
                )}
              </div>
            </Field>
          </div>

          {/*
            Set at the point the account is created, not afterwards.
            Leaving both on and expecting an administrator to come back and
            withdraw one means the new starter has the wider rights for however
            long that takes, which is the window that matters.
          */}
          {canAtLeast(permission, "booking") && (
            <div className="border-ink-100 flex flex-wrap items-center gap-x-5 border-t pt-2">
              <Toggle checked={mayHold} onChange={setMayHold} label={t("agency.mayHold")} />
              <Toggle
                checked={mayNonRefundable}
                onChange={setMayNonRefundable}
                label={t("agency.mayBookNonRefundable")}
              />
            </div>
          )}
          <Button onClick={invite} loading={busy} disabled={!name || !email}>
            {t("agency.addSubAgent")}
          </Button>
        </Card>
      ) : (
        <p className="text-muted text-sm">{t("agency.noPoolToShare")}</p>
      )}
    </div>
  );
}

/**
 * The two commercial settings, edited in place.
 *
 * Kept out of the row itself because they are the rare change — a permission
 * moves when somebody is promoted, an allocation moves when the arrangement
 * does — and two number boxes on every row would bury the switches that get
 * used daily.
 */
function AllocationEditor({
  agent,
  currency,
  locale,
  ceiling,
  onSave,
}: {
  agent: Agent;
  currency: CurrencyCode;
  locale: Locale;
  ceiling: number;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useApp();
  const [limit, setLimit] = useState(agent.creditLimit === undefined ? "" : String(agent.creditLimit));
  const [mode, setMode] = useState<"inherit" | "percent" | "fixed">(agent.markup?.mode ?? "inherit");
  const [value, setValue] = useState(agent.markup ? String(agent.markup.value) : "");
  const [saving, setSaving] = useState(false);

  const asked = Number(limit);
  const overCeiling = Boolean(limit.trim()) && Number.isFinite(asked) && asked > ceiling;

  return (
    <div className="border-ink-100 grid gap-3 border-t pt-3 sm:grid-cols-3">
      <Field
        label={t("agency.creditAllocation")}
        htmlFor={`limit-${agent.id}`}
        hint={t("agency.allocationHint", { amount: formatMoney(ceiling, currency, locale) })}
        error={overCeiling ? t("agency.allocationTooLarge") : undefined}
      >
        <Input
          id={`limit-${agent.id}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={ceiling}
          value={limit}
          error={overCeiling}
          onChange={(e) => setLimit(e.target.value)}
        />
      </Field>
      <Field label={t("agency.sellsAt")} htmlFor={`markup-${agent.id}`}>
        <div className="flex gap-2">
          <Select
            id={`markup-${agent.id}`}
            className="!w-auto grow"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="inherit">{t("agency.markupInherit")}</option>
            <option value="percent">{t("agency.markupPercent")}</option>
            <option value="fixed">{t("agency.markupFixed")}</option>
          </Select>
          {mode !== "inherit" && (
            <Input
              aria-label={t("agency.sellsAt")}
              className="!w-24"
              type="number"
              inputMode="numeric"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>
      </Field>
      <div className="flex items-end">
        <Button
          size="sm"
          loading={saving}
          disabled={overCeiling}
          onClick={async () => {
            setSaving(true);
            await onSave({
              ...(limit.trim() ? { creditLimit: Number(limit) } : {}),
              ...(mode === "inherit"
                ? {}
                : {
                    markup: {
                      mode,
                      value: Number(value),
                      ...(mode === "fixed" ? { currency } : {}),
                    },
                  }),
            });
            setSaving(false);
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ settings */

export function AgencySettingsView({ locale }: { locale: Locale }) {
  return (
    <PortalShell locale={locale}>{(context) => <SettingsPanel locale={locale} context={context} />}</PortalShell>
  );
}

function SettingsPanel({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const [markup, setMarkup] = useState<MarkupPolicy>(context.agency.markup);
  const [profile, setProfile] = useState<AgencyProfile>(context.agency.profile);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = context.session.role === "admin";
  const currency = context.agency.credit.currency as CurrencyCode;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body = await apiFetch<unknown>("/api/agency/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markup, profile }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setSaved(true);
    refreshAgency();
  }

  function setDefault(next: Partial<MarkupRule>) {
    setMarkup({ ...markup, default: { ...markup.default, ...next } });
  }

  function setOverride(index: number, next: Partial<MarkupOverride>) {
    setMarkup({
      ...markup,
      overrides: markup.overrides.map((o, i) => (i === index ? { ...o, ...next } : o)),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("agency.settings")} description={t("agency.settingsIntro")} />
      {error && <Alert tone="critical">{error}</Alert>}
      {saved && <Alert tone="success">{t("agency.markupSaved")}</Alert>}

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("agency.commission")}</h2>
        <p className="text-2xl font-bold">{context.agency.commissionPercent}%</p>
        <p className="text-muted text-sm">{t("agency.commissionBody")}</p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t("agency.markup")}</h2>
        <p className="text-muted text-sm">{t("agency.markupBody")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("agency.markupMode")} htmlFor="markup-mode">
            <Select
              id="markup-mode"
              value={markup.default.mode}
              disabled={!isAdmin}
              onChange={(e) => setDefault({ mode: e.target.value as MarkupRule["mode"] })}
            >
              <option value="percent">{t("agency.markupPercent")}</option>
              <option value="fixed">{t("agency.markupFixed")}</option>
            </Select>
          </Field>
          <Field label={markup.default.mode === "percent" ? "%" : currency} htmlFor="markup-value">
            <Input
              id="markup-value"
              type="number"
              min={0}
              step={markup.default.mode === "percent" ? 0.5 : 1}
              value={String(markup.default.value)}
              disabled={!isAdmin}
              onChange={(e) => setDefault({ value: Number(e.target.value) })}
            />
          </Field>
        </div>

        <p className="text-muted text-sm">
          {t("agency.cost")} {formatMoney(1000, currency, locale)} → {t("agency.sell")}{" "}
          <strong>{formatMoney(previewSell(1000, markup.default), currency, locale)}</strong>
        </p>
      </Card>

      {/*
        Per-country margins. Kept on its own card because it is a list an agency
        edits occasionally, not a setting they scan — and burying it under the
        default rule made both look like one control.
      */}
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t("agency.overrides")}</h2>
        <p className="text-muted text-sm">{t("agency.overridesBody")}</p>

        {!markup.overrides.length && <p className="text-muted text-sm">{t("agency.noOverrides")}</p>}

        <ul className="space-y-2">
          {markup.overrides.map((override, index) => (
            <li key={index} className="grid items-end gap-2 sm:grid-cols-[110px_1fr_120px_auto]">
              <Field label={t("agency.country")} htmlFor={`ov-country-${index}`}>
                <Input
                  id={`ov-country-${index}`}
                  value={override.countryCode}
                  maxLength={2}
                  disabled={!isAdmin}
                  onChange={(e) => setOverride(index, { countryCode: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label={t("agency.markupMode")} htmlFor={`ov-mode-${index}`}>
                <Select
                  id={`ov-mode-${index}`}
                  value={override.rule.mode}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    setOverride(index, { rule: { ...override.rule, mode: e.target.value as MarkupRule["mode"] } })
                  }
                >
                  <option value="percent">{t("agency.markupPercent")}</option>
                  <option value="fixed">{t("agency.markupFixed")}</option>
                </Select>
              </Field>
              <Field label={override.rule.mode === "percent" ? "%" : currency} htmlFor={`ov-value-${index}`}>
                <Input
                  id={`ov-value-${index}`}
                  type="number"
                  min={0}
                  step={override.rule.mode === "percent" ? 0.5 : 1}
                  value={String(override.rule.value)}
                  disabled={!isAdmin}
                  onChange={(e) => setOverride(index, { rule: { ...override.rule, value: Number(e.target.value) } })}
                />
              </Field>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setMarkup({ ...markup, overrides: markup.overrides.filter((_, i) => i !== index) })
                  }
                >
                  {t("common.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setMarkup({
                ...markup,
                overrides: [...markup.overrides, { countryCode: "", rule: { mode: "percent", value: 10 } }],
              })
            }
          >
            {t("agency.addOverride")}
          </Button>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t("agency.profile")}</h2>
        <p className="text-muted text-sm">{t("agency.profileBody")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("agency.legalName")} htmlFor="pf-legal">
            <Input
              id="pf-legal"
              value={profile.legalName}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, legalName: e.target.value })}
            />
          </Field>
          <Field label={t("agency.taxNumber")} htmlFor="pf-tax">
            <Input
              id="pf-tax"
              value={profile.taxNumber ?? ""}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, taxNumber: e.target.value })}
            />
          </Field>
          <Field label={t("agency.address")} htmlFor="pf-address">
            <Input
              id="pf-address"
              value={profile.address}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            />
          </Field>
          <Field label={t("agency.city")} htmlFor="pf-city">
            <Input
              id="pf-city"
              value={profile.city}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, city: e.target.value })}
            />
          </Field>
          <Field label={t("agency.workEmail")} htmlFor="pf-email">
            <Input
              id="pf-email"
              type="email"
              value={profile.email}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </Field>
          <Field label={t("agency.phone")} htmlFor="pf-phone">
            <Input
              id="pf-phone"
              value={profile.phone}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </Field>
        </div>
      </Card>

      <BrandingCard
        profile={profile}
        setProfile={setProfile}
        agencyId={context.agency.id}
        agencyName={context.agency.name}
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <Button onClick={save} loading={busy}>
          {t("common.save")}
        </Button>
      )}
    </div>
  );
}

/** What a $1,000 cost sells for under a rule — the sanity check before saving. */
/**
 * The agency's own identity on what its customers receive.
 *
 * Kept apart from the profile card above it because these are different
 * questions. That one is who the agency legally is — the details that have to
 * be right on an invoice. This one is what their paperwork looks like, and the
 * only way to answer it is to see it.
 *
 * So the preview is not a mock-up: it is `DocumentBrand`, the component the
 * quotation and the voucher actually render, given the values in the form as
 * they are typed. A preview drawn separately would be a second implementation
 * of the letterhead, and the day it drifted, the agency would find out from a
 * customer.
 */
function BrandingCard({
  profile,
  setProfile,
  agencyId,
  agencyName,
  isAdmin,
}: {
  profile: AgencyProfile;
  setProfile: (next: AgencyProfile) => void;
  agencyId: string;
  agencyName: string;
  isAdmin: boolean;
}) {
  const { t } = useApp();

  /*
   * What the form currently describes, resolved exactly as the document will
   * resolve it — including the default colour when the field is empty and the
   * readable ink that goes on top of whatever was chosen.
   */
  const branding = brandingOf({ id: agencyId, name: agencyName, profile });

  /*
   * The colour swatch needs a valid hex or it silently shows black, so the
   * picker is fed the resolved colour while the text field keeps whatever the
   * agency is midway through typing. Binding both to the raw value makes the
   * swatch flicker to black on every keystroke of `#1a2b3c`.
   */
  const typed = profile.brandColor ?? "";
  const colorInvalid = typed.trim() !== "" && normalizeHex(typed) === null;

  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  /**
   * The upload is its own request, not part of Save.
   *
   * The rest of this card is text that only means something once the agency
   * presses Save; a file is different — it either arrived or it did not, and
   * waiting to find out until the whole form is submitted is how someone ends
   * up with the wrong logo on a voucher and no idea when it went wrong. So it
   * goes immediately, and the preview above is the receipt.
   */
  async function uploadLogo(file: File): Promise<void> {
    setUploading(true);
    setLogoError(null);
    const body = new FormData();
    body.append("logo", file);
    const res = await fetch(apiUrl("/api/agency/logo"), {
      method: "POST",
      credentials: apiCredentials(),
      body,
    });
    const payload = (await res.json()) as {
      ok: boolean;
      data?: { uploadedAt: string };
      error?: { message: string };
    };
    setUploading(false);
    if (!payload.ok || !payload.data) {
      setLogoError(payload.error?.message ?? t("error.validation"));
      return;
    }
    // Mirrored into the form so the preview updates now; the server has already
    // cleared any linked URL, and this keeps the two from disagreeing on screen.
    setProfile({ ...profile, logoUrl: "", logoUploadedAt: payload.data.uploadedAt });
    refreshAgency();
  }

  async function removeLogo(): Promise<void> {
    setUploading(true);
    setLogoError(null);
    await fetch(apiUrl("/api/agency/logo"), { method: "DELETE", credentials: apiCredentials() });
    setUploading(false);
    setProfile({ ...profile, logoUploadedAt: undefined });
    refreshAgency();
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{t("agency.branding")}</h2>
        <p className="text-muted text-sm">{t("agency.brandingBody")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/*
          Two ways to give us a logo, because agencies arrive with either.
          Uploading is what most of them need — the file is on somebody's
          desktop, not a CDN — and pasting a link is better for the ones who
          host it already. Setting one clears the other on the server, so there
          is never a pair and a precedence rule to explain.
        */}
        <Field
          label={t("agency.logo")}
          htmlFor="pf-logo-file"
          hint={logoError ?? t("agency.logoUploadHint")}
          className="sm:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-3">
            {branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.name}
                className="hairline h-12 w-auto max-w-[160px] rounded-[var(--radius-control)] border object-contain p-1"
              />
            )}
            <input
              id="pf-logo-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!isAdmin || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Cleared so choosing the same file twice still fires a change,
                // which is what happens after a failed upload is retried.
                e.target.value = "";
                if (file) void uploadLogo(file);
              }}
              className="text-muted file:hairline max-w-full text-sm file:me-3 file:rounded-[var(--radius-control)] file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
            />
            {profile.logoUploadedAt && isAdmin && (
              <Button size="sm" variant="ghost" onClick={() => void removeLogo()} loading={uploading}>
                {t("common.remove")}
              </Button>
            )}
          </div>
        </Field>

        <Field
          label={t("agency.logoUrl")}
          htmlFor="pf-logo"
          hint={profile.logoUploadedAt ? t("agency.logoUrlReplaced") : t("agency.logoUrlHint")}
        >
          <Input
            id="pf-logo"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={profile.logoUrl ?? ""}
            disabled={!isAdmin || Boolean(profile.logoUploadedAt)}
            onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
          />
        </Field>

        <Field label={t("agency.website")} htmlFor="pf-website" hint={t("agency.websiteHint")}>
          <Input
            id="pf-website"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={profile.website ?? ""}
            disabled={!isAdmin}
            onChange={(e) => setProfile({ ...profile, website: e.target.value })}
          />
        </Field>

        <Field
          label={t("agency.brandColor")}
          htmlFor="pf-color"
          hint={colorInvalid ? t("agency.colorInvalid") : t("agency.brandColorHint")}
          className="sm:col-span-2"
        >
          <div className="flex items-center gap-2">
            {/*
              Two ways in, because agencies arrive with either. A brand book
              gives a hex to paste; someone matching a logo by eye wants the
              swatch. They write the same value.
            */}
            <input
              type="color"
              aria-label={t("agency.brandColor")}
              value={branding.color}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, brandColor: e.target.value })}
              className="hairline h-10 w-14 shrink-0 cursor-pointer rounded-[var(--radius-control)] border bg-transparent p-1"
            />
            <Input
              id="pf-color"
              placeholder={DEFAULT_BRAND_COLOR}
              value={typed}
              disabled={!isAdmin}
              onChange={(e) => setProfile({ ...profile, brandColor: e.target.value })}
              className="font-mono"
            />
          </div>
        </Field>

        <Field
          label={t("agency.documentFooter")}
          htmlFor="pf-footer"
          hint={t("agency.documentFooterHint")}
          className="sm:col-span-2"
        >
          <textarea
            id="pf-footer"
            rows={4}
            maxLength={1200}
            value={profile.documentFooter ?? ""}
            disabled={!isAdmin}
            onChange={(e) => setProfile({ ...profile, documentFooter: e.target.value })}
            className="hairline focus-ring w-full rounded-[var(--radius-control)] border px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <div>
        <SectionHeading title={t("agency.brandingPreview")} />
        <div className="hairline surface-sunken mt-2 rounded-[var(--radius-card)] border p-4">
          <DocumentBrand
            branding={branding}
            title={t("agency.quotation")}
            reference="QT-000000"
            meta={t("agency.brandingPreviewMeta")}
          />
          <DocumentFooter branding={branding} />
        </div>
      </div>
    </Card>
  );
}

function previewSell(cost: number, rule: MarkupRule): number {
  return rule.mode === "percent"
    ? Math.round(cost * (1 + Math.max(0, rule.value) / 100))
    : cost + Math.max(0, Math.round(rule.value));
}
