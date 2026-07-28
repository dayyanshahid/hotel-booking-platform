"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionHeading,
  Select,
  Skeleton,
  cx,
} from "@/components/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { Agent, AgencyBooking, LedgerEntry, MarkupRule } from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";

/* ------------------------------------------------------------- sign-in */

/**
 * Agent sign-in.
 *
 * Same two steps as the consumer flow — address, then a code — because an
 * agency counter is a shared machine and a password on a shared machine is a
 * password on a sticky note.
 */
export function AgencySignInView({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/agency/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { demoCode?: string } };
    setBusy(false);
    if (!body.ok) {
      setError(t("error.validation"));
      return;
    }
    setStage("code");
    // Demo environment only — the endpoint returns the code so the flow can be
    // walked without a mailbox. A real deployment sends it and returns nothing.
    setHint(body.data?.demoCode ?? null);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/agency/session", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
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

  return (
    <div className="mx-auto max-w-md space-y-5 py-8">
      <div className="space-y-2 text-center">
        <Wordmark />
        <h1 className="text-xl font-bold">{t("agency.signIn")}</h1>
        <p className="text-muted text-sm">{t("agency.signInBody")}</p>
      </div>

      <Card className="space-y-4 p-5">
        {error && <Alert tone="critical">{error}</Alert>}

        <Field label={t("agency.workEmail")} htmlFor="agency-email">
          <Input
            id="agency-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={stage === "code"}
          />
        </Field>

        {stage === "email" ? (
          <Button onClick={send} loading={busy} disabled={!email} className="w-full">
            {t("agency.sendCode")}
          </Button>
        ) : (
          <>
            <p className="text-muted text-sm">{t("agency.codeSent")}</p>
            {hint && (
              <Alert tone="info">
                <span className="font-mono text-sm">{hint}</span>
              </Alert>
            )}
            <Field label={t("agency.code")} htmlFor="agency-code">
              <Input
                id="agency-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Button onClick={verify} loading={busy} disabled={!code} className="w-full">
              {t("agency.verify")}
            </Button>
          </>
        )}
      </Card>

      <p className="text-center text-sm">
        <Link href={href(locale, "/")} className="underline">
          {t("agency.notAgent")}
        </Link>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------- dashboard */

export function AgencyDashboardView({ locale }: { locale: Locale }) {
  return (
    <PortalShell locale={locale}>
      {(context) => <Dashboard locale={locale} context={context} />}
    </PortalShell>
  );
}

function Dashboard({ locale, context }: { locale: Locale; context: AgencyContext }) {
  const { t } = useApp();
  const [bookings, setBookings] = useState<AgencyBooking[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/agency/bookings", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { bookings: AgencyBooking[] } };
      setBookings(body.ok && body.data ? body.data.bookings : []);
    })();
  }, []);

  const currency = (context.balance?.currency ?? context.agency.credit.currency) as CurrencyCode;
  const live = (bookings ?? []).filter((b) => b.status === "confirmed" || b.status === "pending");
  const margin = live.reduce((sum, b) => sum + (b.sell - b.cost), 0);

  return (
    <div className="space-y-5">
      <CreditPanel locale={locale} context={context} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={t("agency.commission")} value={`${context.agency.commissionPercent}%`} />
        <Figure
          label={t("agency.markup")}
          value={
            context.agency.markup.mode === "percent"
              ? `${context.agency.markup.value}%`
              : formatMoney(context.agency.markup.value, currency, locale)
          }
        />
        <Figure label={t("agency.margin")} value={formatMoney(margin, currency, locale)} />
      </div>

      <section className="space-y-3">
        <SectionHeading
          title={t("agency.bookings")}
          description={t("agency.bookingsBody")}
          action={
            <Link href={href(locale, "/agency/bookings")}>
              <Button variant="secondary" size="sm">
                {t("agency.viewAll")}
              </Button>
            </Link>
          }
        />
        {!bookings && <Skeleton className="h-24 w-full" />}
        {bookings && !bookings.length && (
          <EmptyState
            standalone
            title={t("agency.noBookings")}
            actions={
              <Link href={href(locale, "/")}>
                <Button>{t("agency.searchStays")}</Button>
              </Link>
            }
          />
        )}
        {bookings && bookings.length > 0 && (
          <BookingTable locale={locale} bookings={bookings.slice(0, 5)} />
        )}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </Card>
  );
}

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
      <p className="text-muted text-xs">{t("agency.creditTerms", { days: context.agency.credit.paymentDays })}</p>
    </Card>
  );
}

/* ------------------------------------------------------------ bookings */

export function AgencyBookingsView({ locale }: { locale: Locale }) {
  return <PortalShell locale={locale}>{() => <BookingsPanel locale={locale} />}</PortalShell>;
}

function BookingsPanel({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [bookings, setBookings] = useState<AgencyBooking[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/agency/bookings", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { bookings: AgencyBooking[] } };
      setBookings(body.ok && body.data ? body.data.bookings : []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <SectionHeading title={t("agency.bookings")} description={t("agency.bookingsBody")} />
      {!bookings && <Skeleton className="h-32 w-full" />}
      {bookings && !bookings.length && (
        <EmptyState
          standalone
          title={t("agency.noBookings")}
          actions={
            <Link href={href(locale, "/")}>
              <Button>{t("agency.searchStays")}</Button>
            </Link>
          }
        />
      )}
      {bookings && bookings.length > 0 && <BookingTable locale={locale} bookings={bookings} />}
    </div>
  );
}

const BOOKING_TONE: Record<AgencyBooking["status"], "positive" | "caution" | "neutral" | "critical"> = {
  confirmed: "positive",
  pending: "caution",
  cancelled: "neutral",
  failed: "critical",
};

/** A status is a label, not a field name — Arabic should not read "cancelled". */
const BOOKING_STATUS: Record<AgencyBooking["status"], string> = {
  confirmed: "agency.statusConfirmed",
  pending: "agency.statusPending",
  cancelled: "agency.statusCancelled",
  failed: "agency.statusFailed",
};

/**
 * The book of business.
 *
 * A real table on a wide screen and a stack of cards on a narrow one, because
 * five money columns squeezed into a phone are five columns nobody can read.
 */
function BookingTable({ locale, bookings }: { locale: Locale; bookings: AgencyBooking[] }) {
  const { t } = useApp();
  return (
    <ul className="space-y-2">
      {bookings.map((booking) => {
        const currency = booking.currency as CurrencyCode;
        return (
          <li key={booking.reference}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={BOOKING_TONE[booking.status]}>{t(BOOKING_STATUS[booking.status])}</Badge>
                  <p className="mt-1 font-semibold wrap-anywhere">{booking.hotelName}</p>
                  <p className="text-muted text-sm">
                    {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
                  </p>
                  <p className="text-muted text-xs">
                    {t("agency.leadGuest")}: {booking.leadGuest} · {t("agency.bookedBy")} {booking.agentName}
                  </p>
                  <p className="text-muted font-mono text-xs">{booking.reference}</p>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-end text-sm">
                  <div>
                    <dt className="text-muted text-xs">{t("agency.cost")}</dt>
                    <dd className="font-semibold">{formatMoney(booking.cost, currency, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t("agency.sell")}</dt>
                    <dd className="font-semibold">{formatMoney(booking.sell, currency, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t("agency.margin")}</dt>
                    <dd className="text-positive-700 font-semibold">
                      {formatMoney(booking.sell - booking.cost, currency, locale)}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------- credit */

export function AgencyCreditView({ locale }: { locale: Locale }) {
  return (
    <PortalShell locale={locale}>
      {(context) => (
        <div className="space-y-4">
          <CreditPanel locale={locale} context={context} />
          <Statement locale={locale} />
        </div>
      )}
    </PortalShell>
  );
}

const LEDGER_LABEL: Record<LedgerEntry["kind"], string> = {
  booking: "agency.ledgerBooking",
  cancellation: "agency.ledgerCancellation",
  settlement: "agency.ledgerSettlement",
  adjustment: "agency.ledgerAdjustment",
};

function Statement({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/agency/ledger", { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { entries: LedgerEntry[] } };
      setEntries(body.ok && body.data ? body.data.entries : []);
    })();
  }, []);

  return (
    <section className="space-y-3">
      <SectionHeading title={t("agency.statement")} description={t("agency.statementBody")} />
      {!entries && <Skeleton className="h-24 w-full" />}
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
  return <PortalShell locale={locale}>{(context) => <TeamPanel context={context} />}</PortalShell>;
}

function TeamPanel({ context }: { context: AgencyContext }) {
  const { t } = useApp();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Agent["role"]>("agent");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = context.session.role === "admin";

  async function reload() {
    const res = await fetch("/api/agency/agents", { credentials: "same-origin" });
    const body = (await res.json()) as { ok: boolean; data?: { agents: Agent[] } };
    setAgents(body.ok && body.data ? body.data.agents : []);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function invite() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/agency/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name, email, role }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setName("");
    setEmail("");
    await reload();
  }

  async function toggle(agent: Agent) {
    const res = await fetch("/api/agency/agents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ agentId: agent.id, active: !agent.active }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    if (!body.ok) setError(body.error?.message ?? t("error.validation"));
    await reload();
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={t("agency.team")} description={t("agency.teamBody")} />
      {error && <Alert tone="critical">{error}</Alert>}

      {!agents && <Skeleton className="h-24 w-full" />}
      {agents && (
        <Card className="divide-ink-100 divide-y">
          {agents.map((agent) => (
            <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium wrap-anywhere">{agent.name}</p>
                <p className="text-muted text-xs wrap-anywhere">{agent.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={agent.role === "admin" ? "brand" : "neutral"}>
                  {agent.role === "admin" ? t("agency.roleAdmin") : t("agency.roleAgent")}
                </Badge>
                {!agent.active && <Badge tone="caution">{t("agency.suspended.badge")}</Badge>}
                {isAdmin && agent.id !== context.session.agentId && (
                  <Button variant="ghost" size="sm" onClick={() => toggle(agent)}>
                    {agent.active ? t("agency.suspend") : t("agency.restore")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {isAdmin ? (
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("agency.invite")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("agency.inviteName")} htmlFor="agent-name">
              <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t("agency.workEmail")} htmlFor="agent-email">
              <Input id="agent-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("agency.role")} htmlFor="agent-role">
              <Select id="agent-role" value={role} onChange={(e) => setRole(e.target.value as Agent["role"])}>
                <option value="agent">{t("agency.roleAgent")}</option>
                <option value="admin">{t("agency.roleAdmin")}</option>
              </Select>
            </Field>
          </div>
          <Button onClick={invite} loading={busy} disabled={!name || !email}>
            {t("agency.invite")}
          </Button>
        </Card>
      ) : (
        <p className="text-muted text-sm">{t("agency.adminNote")}</p>
      )}
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
  const [markup, setMarkup] = useState<MarkupRule>(context.agency.markup);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = context.session.role === "admin";
  const currency = context.agency.credit.currency as CurrencyCode;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/agency/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ markup }),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setSaved(true);
    refreshAgency();
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={t("agency.settings")} />

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">{t("agency.commission")}</h2>
        <p className="text-2xl font-bold">{context.agency.commissionPercent}%</p>
        <p className="text-muted text-sm">{t("agency.commissionBody")}</p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">{t("agency.markup")}</h2>
        <p className="text-muted text-sm">{t("agency.markupBody")}</p>
        {error && <Alert tone="critical">{error}</Alert>}
        {saved && <Alert tone="success">{t("agency.markupSaved")}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("agency.markupMode")} htmlFor="markup-mode">
            <Select
              id="markup-mode"
              value={markup.mode}
              disabled={!isAdmin}
              onChange={(e) => setMarkup({ ...markup, mode: e.target.value as MarkupRule["mode"] })}
            >
              <option value="percent">{t("agency.markupPercent")}</option>
              <option value="fixed">{t("agency.markupFixed")}</option>
            </Select>
          </Field>
          <Field
            label={markup.mode === "percent" ? "%" : currency}
            htmlFor="markup-value"
          >
            <Input
              id="markup-value"
              type="number"
              min={0}
              step={markup.mode === "percent" ? 0.5 : 1}
              value={String(markup.value)}
              disabled={!isAdmin}
              onChange={(e) => setMarkup({ ...markup, value: Number(e.target.value) })}
            />
          </Field>
        </div>

        <p className="text-muted text-sm">
          {t("agency.cost")} {formatMoney(1000, currency, locale)} → {t("agency.sell")}{" "}
          <strong>
            {formatMoney(
              markup.mode === "percent"
                ? Math.round(1000 * (1 + Math.max(0, markup.value) / 100))
                : 1000 + Math.max(0, Math.round(markup.value)),
              currency,
              locale,
            )}
          </strong>
        </p>

        {isAdmin && (
          <Button onClick={save} loading={busy}>
            {t("common.save")}
          </Button>
        )}
      </Card>
    </div>
  );
}
