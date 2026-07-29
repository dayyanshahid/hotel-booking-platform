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
import type { Booking, CancellationQuote, CurrencyCode, Locale, SupportCase } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";

/* ------------------------------------------------------------ bookings */

interface Row {
  reference: string;
  status: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  email: string;
  total: number;
  currency: string;
  createdAt: string;
  channel: "direct" | "trade";
  agencyName?: string;
}

const STATUS_TONE: Record<string, "positive" | "caution" | "critical" | "neutral"> = {
  confirmed: "positive",
  pending: "caution",
  processing: "caution",
  reconciliationRequired: "caution",
  cancelled: "neutral",
  failed: "critical",
};

export function AdminBookingsView({ locale, initialStatus }: { locale: Locale; initialStatus?: string }) {
  return <ConsoleShell locale={locale}>{() => <BookingBrowser locale={locale} initialStatus={initialStatus} />}</ConsoleShell>;
}

function BookingBrowser({ locale, initialStatus }: { locale: Locale; initialStatus?: string }) {
  const { t } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState(initialStatus ?? "all");
  const [channel, setChannel] = useState("all");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      const params = new URLSearchParams({ status, channel, q: query, from, to });
      const res = await fetch(apiUrl(`/api/admin/bookings?${params.toString()}`), { credentials: apiCredentials() });
      const body = (await res.json()) as { ok: boolean; data?: { bookings: Row[]; total: number } };
      if (!alive) return;
      setRows(body.ok && body.data ? body.data.bookings : []);
      setTotal(body.ok && body.data ? body.data.total : 0);
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [status, channel, query, from, to]);

  return (
    <div className="space-y-4">
      <SectionHeading
        title={t("admin.bookings")}
        description={t("admin.bookingsBody")}
        action={
          <a
            href={`/api/admin/bookings?format=csv&status=${status}&channel=${channel}&q=${encodeURIComponent(query)}&from=${from}&to=${to}&limit=500`}
          >
            <Button variant="secondary" size="sm">
              CSV
            </Button>
          </a>
        }
      />

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t("admin.search")} htmlFor="ab-q">
          <Input
            id="ab-q"
            value={query}
            placeholder={t("admin.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field label={t("admin.statusFilter")} htmlFor="ab-status">
          <Select id="ab-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t("admin.allStatuses")}</option>
            <option value="attention">{t("admin.needsAttention")}</option>
            <option value="confirmed">{t("agency.statusConfirmed")}</option>
            <option value="pending">{t("agency.statusPending")}</option>
            <option value="cancelled">{t("agency.statusCancelled")}</option>
            <option value="failed">{t("agency.statusFailed")}</option>
          </Select>
        </Field>
        <Field label={t("admin.channel")} htmlFor="ab-channel">
          <Select id="ab-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">{t("admin.allChannels")}</option>
            <option value="direct">{t("admin.b2c")}</option>
            <option value="trade">{t("admin.b2b")}</option>
          </Select>
        </Field>
        <Field label={t("admin.bookedFrom")} htmlFor="ab-from">
          <Input id="ab-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t("admin.bookedTo")} htmlFor="ab-to">
          <Input id="ab-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </Card>

      {!rows && <Skeleton className="h-64 w-full" />}
      {rows && !rows.length && <Alert tone="info">{t("admin.noBookings")}</Alert>}

      {rows && rows.length > 0 && (
        <>
          <p className="text-muted text-sm">{t("admin.showing", { shown: rows.length, total })}</p>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-muted hairline border-b text-xs">
                <tr>
                  <th className="p-3 text-start font-medium">{t("booking.reference")}</th>
                  <th className="p-3 text-start font-medium">{t("admin.property")}</th>
                  <th className="p-3 text-start font-medium">{t("admin.guest")}</th>
                  <th className="p-3 text-start font-medium">{t("admin.stay")}</th>
                  <th className="p-3 text-start font-medium">{t("admin.channel")}</th>
                  <th className="p-3 text-end font-medium">{t("common.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-ink-100 divide-y">
                {rows.map((row) => (
                  <tr key={row.reference}>
                    <td className="p-3">
                      <Link
                        href={href(locale, `/admin/bookings/${row.reference}`)}
                        className="font-mono text-xs underline"
                      >
                        {row.reference}
                      </Link>
                      <div className="mt-1">
                        <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>{row.status}</Badge>
                      </div>
                    </td>
                    <td className="p-3 wrap-anywhere">{row.hotelName}</td>
                    <td className="p-3 wrap-anywhere">
                      {row.guest}
                      <div className="text-muted text-xs wrap-anywhere">{row.email}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {formatDate(row.checkIn, locale)} → {formatDate(row.checkOut, locale)}
                    </td>
                    <td className="p-3">
                      <Badge tone={row.channel === "trade" ? "brand" : "neutral"}>
                        {row.channel === "trade" ? t("admin.b2b") : t("admin.b2c")}
                      </Badge>
                      {row.agencyName && <div className="text-muted text-xs wrap-anywhere">{row.agencyName}</div>}
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      {formatMoney(row.total, row.currency as CurrencyCode, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ booking detail */

interface DetailPayload {
  booking: Booking;
  trade: { agencyName: string; cost: number; sell: number; agentName: string } | null;
  supplier: { source: string; reference: string } | null;
}

export function AdminBookingView({ locale, reference }: { locale: Locale; reference: string }) {
  return <ConsoleShell locale={locale}>{() => <BookingDetail locale={locale} reference={reference} />}</ConsoleShell>;
}

function BookingDetail({ locale, reference }: { locale: Locale; reference: string }) {
  const { t } = useApp();
  const [data, setData] = useState<DetailPayload | null | "missing">(null);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}`), { credentials: apiCredentials() });
    const body = (await res.json()) as { ok: boolean; data?: DetailPayload };
    setData(body.ok && body.data ? body.data : "missing");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  if (data === null) return <Skeleton className="h-64 w-full" />;
  if (data === "missing") return <Alert tone="critical">{t("error.notFound")}</Alert>;

  const { booking, trade, supplier } = data;
  const currency = booking.price.currency as CurrencyCode;

  async function act(path: string, init: RequestInit, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}/${path}`), {
      credentials: apiCredentials(),
      ...init,
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return false;
    }
    setNotice(message);
    await load();
    return true;
  }

  async function resend() {
    await act("resend", { method: "POST" }, t("admin.resent"));
  }

  async function askQuote() {
    setBusy(true);
    setError(null);
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}/cancel`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { ok: boolean; data?: { quote: CancellationQuote }; error?: { message: string } };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setQuote(body.data.quote);
    setOpen(true);
  }

  async function confirm() {
    if (!quote) return;
    setBusy(true);
    const res = await fetch(apiUrl(`/api/admin/bookings/${encodeURIComponent(reference)}/cancel`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify({ quoteId: quote.quoteId, idempotencyKey: `ops-${quote.quoteId}`, reason }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { uncertain?: boolean }; error?: { message: string } };
    setBusy(false);
    if (!body.ok) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    setOpen(false);
    setNotice(body.data?.uncertain ? t("agency.cancelReconciling") : t("agency.cancelDone"));
    await load();
  }

  const cancellable = booking.capabilities.cancelAllowed && booking.status !== "cancelled";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={href(locale, "/admin/bookings")} className="text-muted text-sm underline">
            ← {t("admin.bookings")}
          </Link>
          <h1 className="mt-1 text-xl font-bold wrap-anywhere">{booking.hotelName}</h1>
          <p className="text-muted text-sm">
            <span className="font-mono">{booking.reference}</span> · {booking.statusDetail}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={resend} loading={busy}>
            {t("admin.resend")}
          </Button>
          <Button variant="secondary" onClick={() => setContactOpen(true)}>
            {t("admin.fixContact")}
          </Button>
          <Button variant="secondary" onClick={() => setNoteOpen(true)}>
            {t("admin.addNote")}
          </Button>
          {cancellable && (
            <Button variant="ghost" onClick={askQuote} loading={busy}>
              {t("admin.cancelForCustomer")}
            </Button>
          )}
        </div>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="critical">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-5 text-sm">
          <h2 className="font-semibold">{t("admin.customer")}</h2>
          <p className="wrap-anywhere">{booking.guests.map((g) => `${g.firstName} ${g.surname}`).join(", ")}</p>
          <p className="text-muted wrap-anywhere">{booking.contact.email}</p>
          <p className="text-muted">{booking.contact.phone}</p>
          <p className="hairline border-t pt-2">
            {formatDate(booking.checkIn, locale)} → {formatDate(booking.checkOut, locale)} · {booking.rooms.length} ×{" "}
            {booking.roomName}
          </p>
          <p className="font-semibold">{formatMoney(booking.price.total, currency, locale)}</p>
        </Card>

        <Card className="space-y-2 p-5 text-sm">
          <h2 className="font-semibold">{t("admin.commercial")}</h2>
          {trade ? (
            <>
              <p>
                <span className="text-muted">{t("admin.soldBy")}: </span>
                {trade.agencyName} · {trade.agentName}
              </p>
              <p>
                <span className="text-muted">{t("agency.cost")}: </span>
                {formatMoney(trade.cost, currency, locale)}
              </p>
              <p>
                <span className="text-muted">{t("admin.retained")}: </span>
                <strong>{formatMoney(booking.price.total - trade.cost, currency, locale)}</strong>
              </p>
            </>
          ) : (
            <p className="text-muted">{t("admin.directBooking")}</p>
          )}
          {/*
            The only surface anywhere that shows a supplier reference, and only
            because a property denying a booking exists cannot be resolved
            without it.
          */}
          {supplier && (
            <p className="hairline border-t pt-2">
              <span className="text-muted">{t("admin.supplierRef")}: </span>
              <span className="font-mono text-xs">
                {supplier.source} · {supplier.reference}
              </span>
            </p>
          )}
        </Card>
      </div>

      <section className="space-y-2">
        <SectionHeading title={t("bookingDetail.timeline")} />
        <Card className="divide-ink-100 divide-y">
          {booking.timeline.map((event, i) => (
            <div key={`${event.code}-${i}`} className="p-3.5 text-sm">
              <p className="font-medium wrap-anywhere">{event.label}</p>
              {event.detail && <p className="text-muted text-xs wrap-anywhere">{event.detail}</p>}
              <p className="text-muted text-xs">
                {formatDateTime(event.at, locale)} · {event.actor}
              </p>
            </div>
          ))}
        </Card>
      </section>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title={t("admin.fixContact")} size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-muted">{t("admin.fixContactBody")}</p>
          <Field label={t("agency.workEmail")} htmlFor="fc-email">
            <Input id="fc-email" type="email" placeholder={booking.contact.email} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t("agency.phone")} htmlFor="fc-phone">
            <Input id="fc-phone" placeholder={booking.contact.phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button
            loading={busy}
            disabled={!email.trim() && !phone.trim()}
            onClick={async () => {
              const done = await act(
                "contact",
                {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ email: email || undefined, phone: phone || undefined }),
                },
                t("admin.contactFixed"),
              );
              if (done) {
                setContactOpen(false);
                setEmail("");
                setPhone("");
              }
            }}
          >
            {t("common.save")}
          </Button>
        </div>
      </Modal>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title={t("admin.addNote")} size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-muted">{t("admin.addNoteBody")}</p>
          <Field label={t("admin.note")} htmlFor="nt-note">
            <Input id="nt-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button
            loading={busy}
            disabled={!note.trim()}
            onClick={async () => {
              const done = await act(
                "note",
                { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) },
                t("admin.noteAdded"),
              );
              if (done) {
                setNoteOpen(false);
                setNote("");
              }
            }}
          >
            {t("admin.addNote")}
          </Button>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={t("admin.cancelForCustomer")} size="sm">
        {quote && (
          <div className="space-y-3 text-sm">
            <p>{t("agency.cancelBody")}</p>
            <div className="flex justify-between">
              <span className="text-muted">{t("cancel.fee")}</span>
              <strong>{formatMoney(quote.fee, quote.currency as CurrencyCode, locale)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t("cancel.refund")}</span>
              <strong>{formatMoney(quote.refundableAmount, quote.currency as CurrencyCode, locale)}</strong>
            </div>
            <Field label={t("admin.reason")} htmlFor="cx-reason">
              <Input id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <p className="text-muted text-xs">{t("admin.cancelAudited")}</p>
            <div className="flex gap-2">
              <Button onClick={confirm} loading={busy} disabled={!reason.trim()}>
                {t("agency.cancelConfirm")}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- cases */

type QueuedCase = SupportCase & { dueAt: string; minutesToDue: number; breached: boolean };

export function AdminCasesView({ locale }: { locale: Locale }) {
  return <ConsoleShell locale={locale}>{() => <CaseQueue locale={locale} />}</ConsoleShell>;
}

function CaseQueue({ locale }: { locale: Locale }) {
  const { t } = useApp();
  const [cases, setCases] = useState<QueuedCase[] | null>(null);
  const [status, setStatus] = useState("open");
  const [owner, setOwner] = useState("all");
  const [you, setYou] = useState("");
  const [active, setActive] = useState<QueuedCase | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(nextStatus = status, nextOwner = owner) {
    const res = await fetch(apiUrl(`/api/admin/cases?status=${nextStatus}&owner=${nextOwner}`), {
      credentials: apiCredentials(),
    });
    const body = (await res.json()) as { ok: boolean; data?: { cases: QueuedCase[]; you: string } };
    setCases(body.ok && body.data ? body.data.cases : []);
    if (body.ok && body.data) setYou(body.data.you);
  }

  useEffect(() => {
    void load(status, owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, owner]);

  async function patch(body: Record<string, unknown>, close = true) {
    if (!active) return;
    setBusy(true);
    await fetch(apiUrl(`/api/admin/cases/${encodeURIComponent(active.caseId)}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (close) {
      setReply("");
      setActive(null);
    }
    await load();
  }

  async function send(nextStatus?: SupportCase["status"]) {
    await patch({ reply: reply || undefined, status: nextStatus });
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={t("admin.cases")} description={t("admin.casesBody")} />

      <Card className="grid gap-3 p-4 sm:max-w-lg sm:grid-cols-2">
        <Field label={t("admin.statusFilter")} htmlFor="ac-status">
          <Select id="ac-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">{t("admin.casesOpen")}</option>
            <option value="resolved">{t("admin.casesResolved")}</option>
            <option value="all">{t("admin.allStatuses")}</option>
          </Select>
        </Field>
        <Field label={t("admin.owner")} htmlFor="ac-owner">
          <Select id="ac-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="all">{t("admin.ownerAny")}</option>
            <option value="mine">{t("admin.ownerMine")}</option>
            <option value="unassigned">{t("admin.ownerUnassigned")}</option>
          </Select>
        </Field>
      </Card>

      {!cases && <Skeleton className="h-48 w-full" />}
      {cases && !cases.length && <Alert tone="info">{t("admin.noCases")}</Alert>}

      <ul className="space-y-2">
        {(cases ?? []).map((item) => (
          <li key={item.caseId}>
            <Card className={cx("p-4", item.breached && "border-critical-500")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.status === "resolved" ? "positive" : item.breached ? "critical" : "caution"}>
                      {item.status}
                    </Badge>
                    <Badge tone="neutral">{item.channel}</Badge>
                    {item.assignee ? (
                      <Badge tone={item.assignee === you ? "brand" : "neutral"}>
                        {item.assignee === you ? t("admin.ownerYou") : item.assignee}
                      </Badge>
                    ) : (
                      <Badge tone="caution">{t("admin.ownerUnassigned")}</Badge>
                    )}
                    {item.bookingReference && (
                      <Link
                        href={href(locale, `/admin/bookings/${item.bookingReference}`)}
                        className="font-mono text-xs underline"
                      >
                        {item.bookingReference}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 font-semibold wrap-anywhere">{item.category}</p>
                  <p className="text-muted text-sm wrap-anywhere">
                    {item.messages[0]?.body ?? ""}
                  </p>
                  <p className={cx("mt-1 text-xs", item.breached ? "text-critical-700" : "text-muted")}>
                    {item.breached
                      ? t("admin.slaBreached")
                      : t("admin.slaDue", { minutes: Math.max(0, item.minutesToDue) })}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setActive(item)}>
                  {t("admin.workCase")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Modal open={Boolean(active)} onClose={() => setActive(null)} title={active?.category ?? ""} size="md">
        {active && (
          <div className="space-y-3">
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {active.messages.map((message, i) => (
                <li
                  key={i}
                  className={cx(
                    "rounded-[var(--radius-control)] p-3 text-sm",
                    message.from === "agent" ? "bg-brand-50/60" : "surface hairline border",
                  )}
                >
                  <p className="wrap-anywhere">{message.body}</p>
                  <p className="text-muted mt-1 text-xs">
                    {message.from} · {formatDateTime(message.at, locale)}
                  </p>
                </li>
              ))}
            </ul>
            <Field label={t("admin.reply")} htmlFor="case-reply">
              <Input id="case-reply" value={reply} onChange={(e) => setReply(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => send("inProgress")} loading={busy} disabled={!reply.trim()}>
                {t("admin.sendReply")}
              </Button>
              <Button variant="secondary" onClick={() => send("resolved")} loading={busy}>
                {t("admin.resolveCase")}
              </Button>
              {active.assignee !== you ? (
                <Button variant="ghost" onClick={() => patch({ assignee: "me" }, false)} loading={busy}>
                  {t("admin.claimCase")}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => patch({ assignee: "" }, false)} loading={busy}>
                  {t("admin.releaseCase")}
                </Button>
              )}
            </div>
            {/* Replying claims an unowned case, so the queue never shows an
                answered case as waiting for someone. */}
            {!active.assignee && <p className="text-muted text-xs">{t("admin.replyClaims")}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
