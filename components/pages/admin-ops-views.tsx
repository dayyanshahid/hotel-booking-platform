"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { ConsoleShell } from "@/components/admin/console-shell";
import { Alert, Badge, Button, Card, Field, Input, SectionHeading, Skeleton, cx } from "@/components/ui";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { Booking, CurrencyCode, Locale, SupportCase, TravelerProfile } from "@/lib/types";
import { apiUrl } from "@/lib/api-origin";

/* --------------------------------------------------------- operations */

interface Pending {
  reference: string;
  status: string;
  hotelName: string;
  email: string;
  total: number;
  currency: string;
  createdAt: string;
  ageHours: number;
  attempts: number;
}

interface Refund {
  reference: string;
  hotelName: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  expectedRange: string;
  initiatedAt: string;
  ageHours: number;
}

interface Incident {
  id: string;
  at: string;
  supplier: string;
  operation: string;
  kind: string;
  detail: string;
  reference?: string;
}

interface OpsPayload {
  reconciliation: Pending[];
  refunds: Refund[];
  incidents: Incident[];
  incidentRate: { supplier: string; count: number }[];
  oldestHours: number;
}

export function AdminOperationsView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Operations locale={locale} />}</ConsoleShell>;
}

function Operations({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [data, setData] = useState<OpsPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(apiUrl("/api/admin/operations"), { credentials: "same-origin" });
    const body = (await res.json()) as { ok: boolean; data?: OpsPayload };
    if (body.ok && body.data) setData(body.data);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!data) return <Skeleton className="h-64 w-full" />;

  async function recheck(reference: string) {
    setBusy(reference);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}/recheck`), {
      method: "POST",
      credentials: "same-origin",
    });
    const body = (await res.json()) as { ok: boolean; data?: { changed: boolean }; error?: { message: string } };
    setBusy(null);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setNotice(body.data?.changed ? t("admin.recheckChanged") : t("admin.recheckUnchanged"));
    await load();
  }

  async function settle(reference: string) {
    setBusy(reference);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}/refund`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(null);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setNotice(t("admin.refundSettled"));
    await load();
  }

  const clean = !data.reconciliation.length && !data.refunds.length;

  return (
    <div className="space-y-5">
      <SectionHeading title={t("admin.operations")} description={t("admin.operationsBody")} />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}
      {clean && <Alert tone="success">{t("admin.queueClear")}</Alert>}

      {data.oldestHours > 24 && (
        <Alert tone="critical" title={t("admin.oldestWaiting", { hours: data.oldestHours })} />
      )}

      {data.reconciliation.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            {t("admin.awaitingConfirmation")} <Badge tone="caution">{data.reconciliation.length}</Badge>
          </h2>
          <p className="text-muted text-sm">{t("admin.awaitingBody")}</p>
          <Card className="divide-ink-100 divide-y">
            {data.reconciliation.map((row) => (
              <div key={row.reference} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm">
                <div className="min-w-0">
                  <Link href={href(locale, `/admin/bookings/${row.reference}`)} className="font-mono text-xs underline">
                    {row.reference}
                  </Link>
                  <p className="font-medium wrap-anywhere">{row.hotelName}</p>
                  <p className="text-muted text-xs wrap-anywhere">{row.email}</p>
                  <p className={cx("text-xs", row.ageHours > 24 ? "text-critical-700" : "text-muted")}>
                    {t("admin.waitingFor", { hours: row.ageHours })} · {t("admin.attempts", { n: row.attempts })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone="caution">{row.status}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => recheck(row.reference)} loading={busy === row.reference}>
                    {t("admin.recheck")}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {data.refunds.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">
            {t("admin.refundsDue")} <Badge tone="caution">{data.refunds.length}</Badge>
          </h2>
          <p className="text-muted text-sm">{t("admin.refundsBody")}</p>
          <Card className="divide-ink-100 divide-y">
            {data.refunds.map((row) => (
              <div key={row.reference} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-sm">
                <div className="min-w-0">
                  <Link href={href(locale, `/admin/bookings/${row.reference}`)} className="font-mono text-xs underline">
                    {row.reference}
                  </Link>
                  <p className="font-medium wrap-anywhere">{row.hotelName}</p>
                  <p className="text-muted text-xs wrap-anywhere">
                    {row.email} · {row.method}
                  </p>
                  <p className={cx("text-xs", row.ageHours > 240 ? "text-critical-700" : "text-muted")}>
                    {t("admin.initiated", { hours: row.ageHours })} · {row.expectedRange}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{formatMoney(row.amount, row.currency as CurrencyCode, locale)}</p>
                  <Button size="sm" onClick={() => settle(row.reference)} loading={busy === row.reference}>
                    {t("admin.markSettled")}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">{t("admin.incidents")}</h2>
        <p className="text-muted text-sm">{t("admin.incidentsBody")}</p>
        {data.incidentRate.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.incidentRate.map((rate) => (
              <Badge key={rate.supplier} tone={rate.count > 5 ? "critical" : "caution"}>
                {rate.supplier}: {t("admin.inLastHour", { n: rate.count })}
              </Badge>
            ))}
          </div>
        )}
        {!data.incidents.length && <p className="text-muted text-sm">{t("admin.noIncidents")}</p>}
        {data.incidents.length > 0 && (
          <Card className="divide-ink-100 divide-y">
            {data.incidents.map((incident) => (
              <div key={incident.id} className="p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {incident.supplier} · {incident.operation}
                  </p>
                  <Badge tone="critical">{incident.kind}</Badge>
                </div>
                <p className="text-muted font-mono text-xs wrap-anywhere">{incident.detail}</p>
                <p className="text-muted text-xs">
                  {formatDateTime(incident.at, locale)}
                  {incident.reference ? ` · ${incident.reference}` : ""}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- customers */

interface CustomerRow {
  email: string;
  name: string;
  bookings: number;
  cancelled: number;
  lifetimeValue: number;
  currency: string;
  lastBookedAt: string;
  openCases: number;
  destinations: string[];
}

export function AdminCustomersView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <Customers locale={locale} />}</ConsoleShell>;
}

function Customers({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      const res = await fetch(apiUrl(`/api/admin/customers?q=${encodeURIComponent(query)}`), { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: { customers: CustomerRow[] } };
      if (alive) setRows(body.ok && body.data ? body.data.customers : []);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query]);

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.customers")} description={t("admin.customersBody")} />

      <Card className="p-4 sm:max-w-md">
        <Field label={t("admin.search")} htmlFor="cu-q">
          <Input id="cu-q" value={query} placeholder={t("admin.customerSearch")} onChange={(e) => setQuery(e.target.value)} />
        </Field>
      </Card>

      {!rows && <Skeleton className="h-48 w-full" />}
      {rows && !rows.length && <Alert tone="info">{t("admin.noCustomers")}</Alert>}

      {rows && rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted hairline border-b text-xs">
              <tr>
                <th className="p-3 text-start font-medium">{t("admin.customer")}</th>
                <th className="p-3 text-end font-medium">{t("admin.bookingsTotal")}</th>
                <th className="p-3 text-end font-medium">{t("admin.cancelled")}</th>
                <th className="p-3 text-end font-medium">{t("admin.lifetimeValue")}</th>
                <th className="p-3 text-end font-medium">{t("admin.openCases")}</th>
                <th className="p-3 text-end font-medium">{t("admin.lastBooked")}</th>
              </tr>
            </thead>
            <tbody className="divide-ink-100 divide-y">
              {rows.map((row) => (
                <tr key={row.email}>
                  <td className="p-3">
                    <Link
                      href={href(locale, `/admin/customers/${encodeURIComponent(row.email)}`)}
                      className="font-medium underline"
                    >
                      {row.name}
                    </Link>
                    <div className="text-muted text-xs wrap-anywhere">{row.email}</div>
                  </td>
                  <td className="p-3 text-end tabular-nums">{row.bookings}</td>
                  <td className="p-3 text-end tabular-nums">{row.cancelled || "—"}</td>
                  <td className="p-3 text-end font-semibold tabular-nums">
                    {formatMoney(row.lifetimeValue, row.currency as CurrencyCode, locale)}
                  </td>
                  <td className="p-3 text-end tabular-nums">
                    {row.openCases > 0 ? <Badge tone="caution">{row.openCases}</Badge> : "—"}
                  </td>
                  <td className="p-3 text-end whitespace-nowrap">{formatDate(row.lastBookedAt.slice(0, 10), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/* ----------------------------------------------------- customer detail */

interface CustomerPayload {
  email: string;
  bookings: Booking[];
  cases: SupportCase[];
  travellers: TravelerProfile[];
  notifications: { id: string; title: string; body: string; createdAt: string }[];
}

export function AdminCustomerView({ locale, email }: { locale: Locale; email: string }) {
  return <ConsoleShell locale={locale}>{() => <CustomerDetail locale={locale} email={email} />}</ConsoleShell>;
}

function CustomerDetail({ locale, email }: { locale: Locale; email: string }) {
  const { t } = useApp();
  const [data, setData] = useState<CustomerPayload | null | "missing">(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(apiUrl(`/api/admin/customers/${encodeURIComponent(email)}`), { credentials: "same-origin" });
      const body = (await res.json()) as { ok: boolean; data?: CustomerPayload };
      setData(body.ok && body.data ? body.data : "missing");
    })();
  }, [email]);

  if (data === null) return <Skeleton className="h-64 w-full" />;
  if (data === "missing") return <Alert tone="critical">{t("error.notFound")}</Alert>;

  return (
    <div className="space-y-4">
      <div>
        <Link href={href(locale, "/admin/customers")} className="text-muted text-sm underline">
          ← {t("admin.customers")}
        </Link>
        <h1 className="mt-1 text-xl font-bold wrap-anywhere">{data.email}</h1>
      </div>

      <section className="space-y-2">
        <SectionHeading title={t("admin.bookings")} />
        <Card className="divide-ink-100 divide-y">
          {data.bookings.map((booking) => (
            <div key={booking.reference} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
              <div className="min-w-0">
                <Link href={href(locale, `/admin/bookings/${booking.reference}`)} className="font-mono text-xs underline">
                  {booking.reference}
                </Link>
                <p className="font-medium wrap-anywhere">{booking.hotelName}</p>
                <p className="text-muted text-xs">
                  {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)}
                </p>
              </div>
              <div className="text-end">
                <Badge tone={booking.status === "confirmed" ? "positive" : booking.status === "cancelled" ? "neutral" : "caution"}>
                  {booking.status}
                </Badge>
                <p className="mt-1 font-semibold">
                  {formatMoney(booking.price.total, booking.price.currency, locale)}
                </p>
              </div>
            </div>
          ))}
        </Card>
      </section>

      {data.cases.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title={t("admin.cases")} />
          <Card className="divide-ink-100 divide-y">
            {data.cases.map((item) => (
              <div key={item.caseId} className="p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.category}</p>
                  <Badge tone={item.status === "resolved" ? "positive" : "caution"}>{item.status}</Badge>
                </div>
                <p className="text-muted text-xs wrap-anywhere">{item.messages[0]?.body}</p>
              </div>
            ))}
          </Card>
        </section>
      )}

      {data.travellers.length > 0 && (
        <section className="space-y-2">
          <SectionHeading title={t("admin.travellers")} />
          <Card className="divide-ink-100 divide-y">
            {data.travellers.map((traveller, i) => (
              <div key={i} className="p-3.5 text-sm wrap-anywhere">
                {traveller.firstName} {traveller.surname}
                {traveller.nationality ? ` · ${traveller.nationality}` : ""}
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-2">
        {/* "I never received a confirmation" is answerable from here. */}
        <SectionHeading title={t("admin.messagesSent")} description={t("admin.messagesSentBody")} />
        {!data.notifications.length && <p className="text-muted text-sm">{t("admin.noMessages")}</p>}
        {data.notifications.length > 0 && (
          <Card className="divide-ink-100 divide-y">
            {data.notifications.map((note) => (
              <div key={note.id} className="p-3.5 text-sm">
                <p className="font-medium wrap-anywhere">{note.title}</p>
                <p className="text-muted text-xs wrap-anywhere">{note.body}</p>
                <p className="text-muted text-xs">{formatDateTime(note.createdAt, locale)}</p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
