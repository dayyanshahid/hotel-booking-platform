"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { useResource } from "@/components/providers/use-resource";
import { PortalShell } from "@/components/agency/portal-shell";
import { refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Select, cx } from "@/components/ui";
import { DataTable, LoadFailed, Money, Nothing, PageHeader, TableSkeleton } from "@/components/agency/ui";
import { Wordmark } from "@/components/ui/wordmark";
import { DocumentBrand, DocumentFooter } from "@/components/agency/document-brand";
import { DEFAULT_BRAND_COLOR, brandingOf, normalizeHex } from "@/lib/agency/branding";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type {
  Agent,
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
import { dayLabel } from "@/lib/i18n";

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

  const rows = (bookings ?? []).filter((booking) => {
    if (status !== "all" && booking.status !== status) return false;
    if (!query.trim()) return true;
    return `${booking.reference} ${booking.hotelName} ${booking.leadGuest}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-5">
      <PageHeader title={t("agency.bookings")} description={t("agency.bookingsBody")} />

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
            <Link href={href(locale, "/agency/search")}>
              <Button>{t("agency.searchStays")}</Button>
            </Link>
          }
        />
      )}
      {bookings && bookings.length > 0 && <BookingTable locale={locale} bookings={rows} />}
    </div>
  );
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
          render: (booking) => <Badge tone={BOOKING_TONE[booking.status]}>{t(BOOKING_STATUS[booking.status])}</Badge>,
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
  return <PortalShell locale={locale}>{(context) => <TeamPanel context={context} />}</PortalShell>;
}

function TeamPanel({ context }: { context: AgencyContext }) {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Agent["role"]>("agent");
  const [permission, setPermission] = useState<AgentPermission>("issue");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = context.session.role === "admin";

  /*
   * The list of people who may spend this agency's credit. Showing an empty
   * one because the read failed invites an administrator to re-invite
   * colleagues who are already there.
   */
  const team = useResource<{ agents: Agent[] }>("/api/agency/agents");
  const agents = team.data?.agents ?? null;
  const reload = team.reload;

  async function invite() {
    setBusy(true);
    setError(null);
    const body = await apiFetch<unknown>("/api/agency/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, role, permission }),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    setName("");
    setEmail("");
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
    const body = await apiFetch<unknown>("/api/agency/agents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, permission: next }),
    });
    if (!body.ok) setError(body.error?.message ?? t("error.validation"));
    await reload();
  }

  async function toggle(agent: Agent) {
    const body = await apiFetch<unknown>("/api/agency/agents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, active: !agent.active }),
    });
    if (!body.ok) setError(body.error?.message ?? t("error.validation"));
    await reload();
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("agency.team")} description={t("agency.teamBody")} />
      {error && <Alert tone="critical">{error}</Alert>}

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
          {agents.map((agent) => (
            <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium wrap-anywhere">{agent.name}</p>
                <p className="text-muted text-xs wrap-anywhere">{agent.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={agent.role === "admin" ? "brand" : "neutral"}>
                  {agent.role === "admin" ? t("agency.roleAdmin") : t("agency.roleAgent")}
                </Badge>
                {isAdmin && agent.id !== context.session.agentId ? (
                  <Select
                    aria-label={t("agency.permission")}
                    className="!min-h-9 w-auto"
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
