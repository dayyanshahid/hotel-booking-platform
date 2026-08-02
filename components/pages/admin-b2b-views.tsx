"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  SectionHeading,
  Select,
  Skeleton,
  cx,
} from "@/components/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import { MAJOR_CURRENCIES } from "@/lib/currencies";
import type {
  Agency,
  AgencyBalance,
  AgencyBooking,
  Agent,
  LedgerEntry,
} from "@/lib/agency/types";
import type { CurrencyCode, Locale } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

/* --------------------------------------------------------------- list */

type Row = Agency & { balance: AgencyBalance | null; agentCount: number };

export function AdminAgenciesView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <AgencyList locale={locale} />}</ConsoleShell>;
}

function AgencyList({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    const body = await apiFetch<{ agencies: Row[] }>("/api/admin/agencies");
    setRows(body.ok && body.data ? body.data.agencies : []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <SectionHeading
        title={t("admin.agencies")}
        description={t("admin.agenciesBody")}
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            {t("admin.onboard")}
          </Button>
        }
      />

      {!rows && <Skeleton className="h-48 w-full" />}
      {rows && !rows.length && <Alert tone="info">{t("admin.noAgencies")}</Alert>}

      {rows && rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted hairline border-b text-xs">
              <tr>
                <th className="p-3 text-start font-medium">{t("admin.agency")}</th>
                <th className="p-3 text-end font-medium">{t("agency.commission")}</th>
                <th className="p-3 text-end font-medium">{t("agency.creditLimit")}</th>
                <th className="p-3 text-end font-medium">{t("admin.committed")}</th>
                <th className="p-3 text-end font-medium">{t("agency.creditAvailable")}</th>
                <th className="p-3 text-end font-medium">{t("agency.team")}</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {rows.map((row) => {
                const currency = row.credit.currency as CurrencyCode;
                // A tenth of the line left is a week's trading for most agencies.
                const low = row.balance && row.balance.limit > 0 && row.balance.available / row.balance.limit < 0.1;
                return (
                  <tr key={row.id}>
                    <td className="p-3">
                      <Link href={href(locale, `/admin/agencies/${row.id}`)} className="font-medium underline">
                        {row.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={row.status === "active" ? "positive" : "critical"}>{row.status}</Badge>
                        <Badge tone="neutral">{row.countryCode}</Badge>
                        {low && <Badge tone="caution">{t("admin.lowCredit")}</Badge>}
                      </div>
                    </td>
                    <td className="p-3 text-end tabular-nums">{row.commissionPercent}%</td>
                    <td className="p-3 text-end tabular-nums">{formatMoney(row.credit.limit, currency, locale)}</td>
                    <td className="p-3 text-end tabular-nums">
                      {formatMoney(row.balance?.used ?? 0, currency, locale)}
                    </td>
                    <td className={cx("p-3 text-end font-semibold tabular-nums", low && "text-caution-700")}>
                      {formatMoney(row.balance?.available ?? 0, currency, locale)}
                    </td>
                    <td className="p-3 text-end tabular-nums">{row.agentCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <OnboardModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={async () => {
          setOpen(false);
          await load();
        }}
      />
    </div>
  );
}

function OnboardModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useApp();
  const [form, setForm] = useState({
    name: "",
    countryCode: "PK",
    commissionPercent: 12,
    creditLimit: 25000,
    currency: "USD",
    paymentDays: 30,
    adminName: "",
    adminEmail: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const body = await apiFetch<unknown>("/api/admin/agencies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.validation"));
      return;
    }
    onCreated();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("admin.onboard")} size="md">
      <div className="space-y-3">
        {error && <Alert tone="critical">{error}</Alert>}
        <p className="text-muted text-sm">{t("admin.onboardBody")}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("admin.agencyName")} htmlFor="on-name">
            <Input id="on-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t("agency.country")} htmlFor="on-country">
            <Input
              id="on-country"
              maxLength={2}
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={t("agency.commission")} htmlFor="on-commission">
            <Input
              id="on-commission"
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={String(form.commissionPercent)}
              onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("agency.creditLimit")} htmlFor="on-limit">
            <Input
              id="on-limit"
              type="number"
              min={0}
              step={500}
              value={String(form.creditLimit)}
              onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("nav.currency")} htmlFor="on-currency">
            <Select
              id="on-currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {MAJOR_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("admin.paymentDays")} htmlFor="on-days">
            <Input
              id="on-days"
              type="number"
              min={0}
              max={120}
              value={String(form.paymentDays)}
              onChange={(e) => setForm({ ...form, paymentDays: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("admin.firstAdmin")} htmlFor="on-admin">
            <Input
              id="on-admin"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
            />
          </Field>
          <Field label={t("agency.workEmail")} htmlFor="on-email">
            <Input
              id="on-email"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
          </Field>
        </div>

        <Button
          onClick={create}
          loading={busy}
          disabled={!form.name.trim() || !form.adminEmail.trim() || !form.adminName.trim()}
        >
          {t("admin.createAgency")}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- detail */

interface DetailPayload {
  agency: Agency;
  balance: AgencyBalance | null;
  agents: Agent[];
  bookings: AgencyBooking[];
  ledger: LedgerEntry[];
  periods: { month: string; charged: number; credited: number; settled: number; currency: string }[];
  production: { count: number; cost: number; retained: number };
}

export function AdminAgencyView({ locale, id }: { locale: Locale; id: string }) {
  return <ConsoleShell locale={locale}>{() => <AgencyDetail locale={locale} id={id} />}</ConsoleShell>;
}

function AgencyDetail({ locale, id }: { locale: Locale; id: string }) {
  const { t } = useApp();
  const [data, setData] = useState<DetailPayload | null | "missing">(null);
  const [terms, setTerms] = useState<{ commissionPercent: number; creditLimit: number; paymentDays: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payment, setPayment] = useState({ kind: "settlement", amount: 0, note: "" });
  const [addingAgent, setAddingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", email: "", role: "agent" });

  async function load() {
    const body = await apiFetch<DetailPayload>(`/api/admin/agencies/${encodeURIComponent(id)}`);
    if (body.ok && body.data) {
      setData(body.data);
      setTerms({
        commissionPercent: body.data.agency.commissionPercent,
        creditLimit: body.data.agency.credit.limit,
        paymentDays: body.data.agency.credit.paymentDays,
      });
    } else {
      setData("missing");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (data === null || !terms) return <Skeleton className="h-64 w-full" />;
  if (data === "missing") return <Alert tone="critical">{t("error.notFound")}</Alert>;

  const { agency, balance, agents, bookings, ledger, periods, production } = data;
  const currency = agency.credit.currency as CurrencyCode;

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl(`/api/admin/agencies/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify(body),
    });
    const result = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? t("error.validation"));
      return;
    }
    setNotice(message);
    await load();
  }

  /**
   * Changing an agent's role or access.
   *
   * The response says whether the change leaves the agency with no active
   * administrator; that is allowed from here — it is the point of the endpoint —
   * but it is surfaced rather than done quietly.
   */
  async function patchAgent(body: { agentId: string; active?: boolean; role?: string }) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl(`/api/admin/agencies/${encodeURIComponent(id)}/agents`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify(body),
    });
    const result = (await res.json()) as { ok: boolean; data?: { leavesNoAdmin: boolean }; error?: { message: string } };
    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? t("error.validation"));
      return;
    }
    setNotice(result.data?.leavesNoAdmin ? t("admin.noAgencyAdmin") : t("admin.agentUpdated"));
    await load();
  }

  async function addAgent() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl(`/api/admin/agencies/${encodeURIComponent(id)}/agents`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify(newAgent),
    });
    const result = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? t("error.validation"));
      return;
    }
    setAddingAgent(false);
    setNewAgent({ name: "", email: "", role: "agent" });
    setNotice(t("admin.agentAdded"));
    await load();
  }

  async function post() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl(`/api/admin/agencies/${encodeURIComponent(id)}/ledger`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify(payment),
    });
    const result = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!result.ok) {
      setError(result.error?.message ?? t("error.validation"));
      return;
    }
    setPayment({ kind: "settlement", amount: 0, note: "" });
    setNotice(t("admin.posted"));
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={href(locale, "/admin/agencies")} className="text-muted text-sm underline">
            ← {t("admin.agencies")}
          </Link>
          <h1 className="mt-1 text-xl font-bold wrap-anywhere">{agency.name}</h1>
          <p className="text-muted text-sm">
            {agency.countryCode} · {agency.profile.legalName}
          </p>
        </div>
        <Button
          variant={agency.status === "active" ? "secondary" : "primary"}
          onClick={() =>
            patch(
              { status: agency.status === "active" ? "suspended" : "active" },
              agency.status === "active" ? t("admin.suspended") : t("admin.reinstated"),
            )
          }
          loading={busy}
        >
          {agency.status === "active" ? t("admin.suspend") : t("admin.reinstate")}
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t("agency.creditAvailable")} value={formatMoney(balance?.available ?? 0, currency, locale)} />
        <Stat label={t("admin.committed")} value={formatMoney(balance?.used ?? 0, currency, locale)} />
        <Stat label={t("admin.bookingsLive")} value={String(production.count)} />
        <Stat label={t("admin.retained")} value={formatMoney(production.retained, currency, locale)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("admin.terms")}</h2>
          <p className="text-muted text-sm">{t("admin.termsBody")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("agency.commission")} htmlFor="tm-commission">
              <Input
                id="tm-commission"
                type="number"
                min={0}
                max={40}
                step={0.5}
                value={String(terms.commissionPercent)}
                onChange={(e) => setTerms({ ...terms, commissionPercent: Number(e.target.value) })}
              />
            </Field>
            <Field label={t("agency.creditLimit")} htmlFor="tm-limit">
              <Input
                id="tm-limit"
                type="number"
                min={0}
                step={500}
                value={String(terms.creditLimit)}
                onChange={(e) => setTerms({ ...terms, creditLimit: Number(e.target.value) })}
              />
            </Field>
            <Field label={t("admin.paymentDays")} htmlFor="tm-days">
              <Input
                id="tm-days"
                type="number"
                min={0}
                max={120}
                value={String(terms.paymentDays)}
                onChange={(e) => setTerms({ ...terms, paymentDays: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Button onClick={() => patch(terms, t("admin.termsSaved"))} loading={busy}>
            {t("common.save")}
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-semibold">{t("admin.postPayment")}</h2>
          <p className="text-muted text-sm">{t("admin.postPaymentBody")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.entryKind")} htmlFor="pm-kind">
              <Select id="pm-kind" value={payment.kind} onChange={(e) => setPayment({ ...payment, kind: e.target.value })}>
                <option value="settlement">{t("agency.ledgerSettlement")}</option>
                <option value="adjustment">{t("agency.ledgerAdjustment")}</option>
              </Select>
            </Field>
            <Field label={`${t("admin.amount")} (${currency})`} htmlFor="pm-amount">
              <Input
                id="pm-amount"
                type="number"
                value={String(payment.amount)}
                onChange={(e) => setPayment({ ...payment, amount: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label={t("admin.note")} htmlFor="pm-note">
            <Input id="pm-note" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
          </Field>
          <Button onClick={post} loading={busy} disabled={!payment.amount || !payment.note.trim()}>
            {t("admin.post")}
          </Button>
        </Card>
      </div>

      {periods.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title={t("agency.periods")} />
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-muted hairline border-b text-xs">
                <tr>
                  <th className="p-3 text-start font-medium">{t("agency.month")}</th>
                  <th className="p-3 text-end font-medium">{t("agency.charged")}</th>
                  <th className="p-3 text-end font-medium">{t("agency.credited")}</th>
                  <th className="p-3 text-end font-medium">{t("agency.settled")}</th>
                  <th className="p-3 text-end font-medium">{t("agency.outstanding")}</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {periods.map((period) => (
                  <tr key={period.month}>
                    <td className="p-3 font-medium">{period.month}</td>
                    <td className="p-3 text-end tabular-nums">{formatMoney(period.charged, currency, locale)}</td>
                    <td className="p-3 text-end tabular-nums">{formatMoney(period.credited, currency, locale)}</td>
                    <td className="p-3 text-end tabular-nums">{formatMoney(period.settled, currency, locale)}</td>
                    <td className="p-3 text-end font-semibold tabular-nums">
                      {formatMoney(Math.max(0, period.charged - period.credited - period.settled), currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <SectionHeading
            title={t("agency.team")}
            description={t("admin.agentsBody")}
            action={
              <Button size="sm" variant="secondary" onClick={() => setAddingAgent(true)}>
                {t("agency.invite")}
              </Button>
            }
          />
          {/*
            An agency whose only administrator has left cannot add another from
            its own portal, so it is said here rather than left to be
            discovered on a support call.
          */}
          {!agents.some((agent) => agent.role === "admin" && agent.active) && (
            <Alert tone="warning">{t("admin.noAgencyAdmin")}</Alert>
          )}
          <Card className="divide-ink-100 divide-y">
            {agents.map((agent) => (
              <div key={agent.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium wrap-anywhere">{agent.name}</p>
                  <p className="text-muted text-xs wrap-anywhere">{agent.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={agent.role === "admin" ? "brand" : "neutral"}>{agent.role}</Badge>
                  {!agent.active && <Badge tone="caution">{t("agency.suspended.badge")}</Badge>}
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy}
                    onClick={() =>
                      patchAgent({ agentId: agent.id, role: agent.role === "admin" ? "agent" : "admin" })
                    }
                  >
                    {agent.role === "admin" ? t("admin.makeAgent") : t("admin.makeAdmin")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy}
                    onClick={() => patchAgent({ agentId: agent.id, active: !agent.active })}
                  >
                    {agent.active ? t("admin.suspend") : t("admin.reinstate")}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section className="space-y-2">
          <SectionHeading title={t("agency.statement")} />
          <Card className="divide-ink-100 divide-y">
            {ledger.slice(0, 12).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-2 p-3.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{entry.kind}</p>
                  <p className="text-muted text-xs wrap-anywhere">{entry.note}</p>
                  <p className="text-muted text-xs">{formatDateTime(entry.at, locale)}</p>
                </div>
                <p
                  className={cx(
                    "font-semibold tabular-nums",
                    entry.amount < 0 ? "text-critical-700" : "text-positive-700",
                  )}
                >
                  {entry.amount < 0 ? "−" : "+"}
                  {formatMoney(Math.abs(entry.amount), currency, locale)}
                </p>
              </div>
            ))}
          </Card>
        </section>
      </div>

      {bookings.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title={t("agency.bookings")} />
          <Card className="divide-ink-100 divide-y">
            {bookings.map((booking) => (
              <div key={booking.reference} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                <div className="min-w-0">
                  <Link
                    href={href(locale, `/admin/bookings/${booking.reference}`)}
                    className="font-mono text-xs underline"
                  >
                    {booking.reference}
                  </Link>
                  <p className="font-medium wrap-anywhere">{booking.hotelName}</p>
                  <p className="text-muted text-xs">
                    {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)} ·{" "}
                    {booking.agentName}
                  </p>
                </div>
                <p className="tabular-nums">{formatMoney(booking.cost, currency, locale)}</p>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Modal open={addingAgent} onClose={() => setAddingAgent(false)} title={t("agency.invite")} size="sm">
        <div className="space-y-3">
          <p className="text-muted text-sm">{t("admin.addAgentBody")}</p>
          <Field label={t("agency.inviteName")} htmlFor="aa-name">
            <Input id="aa-name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
          </Field>
          <Field label={t("agency.workEmail")} htmlFor="aa-email">
            <Input
              id="aa-email"
              type="email"
              value={newAgent.email}
              onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
            />
          </Field>
          <Field label={t("agency.role")} htmlFor="aa-role">
            <Select id="aa-role" value={newAgent.role} onChange={(e) => setNewAgent({ ...newAgent, role: e.target.value })}>
              <option value="agent">{t("agency.roleAgent")}</option>
              <option value="admin">{t("agency.roleAdmin")}</option>
            </Select>
          </Field>
          <Button onClick={addAgent} loading={busy} disabled={!newAgent.name.trim() || !newAgent.email.trim()}>
            {t("agency.invite")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </Card>
  );
}
