"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  SectionHeading,
  Select,
  cx,
} from "@/components/ui";
import { EmptyTripsArt, SupportArt } from "@/components/ui/illustrations";
import { formatRelative } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AppNotification, Locale, PriceAlert, SupportCase } from "@/lib/types";
import { hourLabel } from "@/lib/i18n";

/* --------------------------------------------------------------- support */

const CATEGORIES: Record<Locale, { id: string; label: string }[]> = {
  en: [
    { id: "booking", label: "A booking or reference" },
    { id: "payment", label: "Payment, invoice or refund" },
    { id: "cancellation", label: "Cancellation or change" },
    { id: "property", label: "Something about the property" },
    { id: "account", label: "Account and sign-in" },
    { id: "other", label: "Something else" },
  ],
  ar: [
    { id: "booking", label: "حجز أو رقم مرجعي" },
    { id: "payment", label: "الدفع أو الفاتورة أو الاسترداد" },
    { id: "cancellation", label: "إلغاء أو تعديل" },
    { id: "property", label: "استفسار عن العقار" },
    { id: "account", label: "الحساب وتسجيل الدخول" },
    { id: "other", label: "موضوع آخر" },
  ],
};

/** F-080 — contextual support with consented booking hand-off (§5.11). */
export function SupportView({ locale, bookingReference }: { locale: Locale; bookingReference?: string }) {
  const { t, track } = useApp();
  const api = useApi();
  const [category, setCategory] = useState("booking");
  const [channel, setChannel] = useState<SupportCase["channel"]>("chat");
  const [message, setMessage] = useState("");
  const [shareContext, setShareContext] = useState(true);
  const [created, setCreated] = useState<SupportCase | null>(null);
  const [cases, setCases] = useState<SupportCase[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await api<{ cases: SupportCase[] }>("/api/support/cases");
      if (res.ok) setCases(res.data.cases);
    })();
  }, [api, created]);

  const channels: { id: SupportCase["channel"]; label: string; sla: number }[] = [
    { id: "chat", label: t("support.chat"), sla: 1 },
    { id: "whatsapp", label: t("support.whatsapp"), sla: 2 },
    { id: "call", label: t("support.call"), sla: 1 },
    { id: "email", label: t("support.email"), sla: 8 },
  ];

  const slaHours = channels.find((c) => c.id === channel)?.sla ?? 8;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <SupportArt className="hidden h-24 w-auto sm:block" />
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{t("support.title")}</h1>
          <p className="text-muted mt-1 text-sm">{t("support.body")}</p>
        </div>
      </div>

      {created ? (
        <Card className="p-5">
          <Alert tone="success" title={t("support.caseCreated")}>
            {t("support.caseRef")}: <span className="font-mono font-bold">{created.caseId}</span>
          </Alert>
          <ul className="mt-4 space-y-3">
            {created.messages.map((entry, i) => (
              <li
                key={i}
                className={cx(
                  "rounded-lg p-3 text-sm",
                  entry.from === "customer" ? "surface-sunken ms-6" : "bg-brand-50 text-brand-900 me-6",
                )}
              >
                {entry.body}
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-xs">{t("support.sla", { hours: created.slaHours, unit: hourLabel(t as never, created.slaHours, locale) })}</p>
          <Button variant="secondary" className="mt-4" onClick={() => setCreated(null)}>
            {t("common.back")}
          </Button>
        </Card>
      ) : (
        <Card className="p-5">
          <SectionHeading title={t("support.categories")} />
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES[locale].map((item) => (
              <label
                key={item.id}
                className={cx(
                  "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3.5 text-sm",
                  "transition-[border-color,background-color,box-shadow] duration-150 ease-[var(--ease-out)]",
                  category === item.id
                    ? "border-brand-500 bg-brand-50 shadow-[0_0_0_3px_var(--ring)]"
                    : "hover:border-brand-300",
                )}
              >
                <input
                  type="radio"
                  name="support-category"
                  checked={category === item.id}
                  onChange={() => setCategory(item.id)}
                  className="size-4 accent-[var(--focus)]"
                />
                {item.label}
              </label>
            ))}
          </div>

          <div className="mt-5">
            <SectionHeading title={t("support.channels")} />
            <div className="flex flex-wrap gap-2">
              {channels.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setChannel(item.id)}
                  aria-pressed={channel === item.id}
                  className={cx(
                    "min-h-11 rounded-[var(--radius-pill)] border px-4 text-sm font-medium",
                    "transition-[background-color,border-color,color] duration-200 ease-[var(--ease-out)]",
                    channel === item.id
                      ? "bg-brand-600 border-brand-600 text-white"
                      : "surface hover:border-brand-300",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-muted mt-2 text-xs">
              {/* A one-hour SLA needs its own string; "within 1 hours" is not a
                  sentence in either language. */}
              {slaHours === 1 ? t("support.slaOne") : t("support.sla", { hours: slaHours, unit: hourLabel(t as never, slaHours, locale) })}
            </p>
          </div>

          <div className="mt-5">
            <Field label={t("assistant.placeholder")} htmlFor="support-message">
              <textarea
                id="support-message"
                rows={4}
                maxLength={800}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="surface w-full rounded-[var(--radius-control)] border px-3.5 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] focus:border-brand-500 focus:shadow-[0_0_0_4px_var(--ring)]"
              />
            </Field>
            {bookingReference && (
              <div className="mt-3">
                <Checkbox
                  checked={shareContext}
                  onChange={(e) => setShareContext(e.target.checked)}
                  label={t("support.consent")}
                  description={bookingReference}
                />
              </div>
            )}
            <Button
              className="mt-4"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await api<SupportCase>("/api/support/cases", {
                  method: "POST",
                  body: JSON.stringify({ category, channel, message, bookingReference, shareContext }),
                });
                setBusy(false);
                if (res.ok) {
                  setCreated(res.data);
                  track("support_opened", { category, channel, hasBooking: Boolean(bookingReference) });
                }
              }}
            >
              {t("common.continue")}
            </Button>
          </div>
        </Card>
      )}

      {cases.length > 0 && (
        <section>
          <SectionHeading title={t("support.openCases")} />
          <ul className="space-y-2">
            {cases.map((item) => (
              <li key={item.caseId}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <span className="font-mono font-semibold">{item.caseId}</span>{" "}
                    <Badge tone="neutral">{item.category}</Badge>
                  </span>
                  <span className="text-muted text-xs">
                    {item.channel} · {formatRelative(item.createdAt, locale)}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="p-4">
        <SectionHeading title={t("cms.help")} />
        <Link href={href(locale, "/help")}>
          <Button variant="secondary" size="sm">
            {t("cms.helpSearch")}
          </Button>
        </Link>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------- notifications */

/** F-081 — booking, payment, price and service events with deep links. */
export function NotificationsView({ locale }: { locale: Locale }) {
  const { t, account, notifications, markNotificationsRead, refreshNotifications } = useApp();

  useEffect(() => {
    void refreshNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!account) {
    return (
      <EmptyState
        standalone
        art={<EmptyTripsArt />}
        title={t("notifications.title")}
        body={t("account.signInBody")}
        actions={
          <Link href={href(locale, "/signin")}>
            <Button>{t("nav.signIn")}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">{t("notifications.title")}</h1>
        <Button variant="secondary" size="sm" onClick={markNotificationsRead}>
          {t("notifications.markRead")}
        </Button>
      </div>
      {!notifications.length && <EmptyState title={t("notifications.empty")} />}
      <ul className="space-y-2">
        {notifications.map((notification: AppNotification) => (
          <li key={notification.id}>
            <Card className={cx("p-4", !notification.read && "border-brand-400")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Badge tone="neutral">{notification.kind}</Badge>
                  <p className="mt-1 font-medium">{notification.title}</p>
                  <p className="text-muted text-sm wrap-anywhere">{notification.body}</p>
                </div>
                <span className="text-muted text-xs">{formatRelative(notification.createdAt, locale)}</span>
              </div>
              {notification.href && (
                <Link href={href(locale, notification.href)} className="mt-2 inline-block">
                  <Button size="sm" variant="secondary">
                    {t("common.viewDetails")}
                  </Button>
                </Link>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- price alerts */

export function AlertsView({ locale }: { locale: Locale }) {
  const { t, currency, recent, track } = useApp();
  const api = useApi();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [target, setTarget] = useState("");
  const [consent, setConsent] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  const load = async () => {
    const res = await api<{ alerts: PriceAlert[] }>("/api/price-alerts");
    if (res.ok) setAlerts(res.data.alerts);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source = recent[selected];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold sm:text-2xl">{t("alerts.title")}</h1>

      <Card className="p-5">
        <SectionHeading title={t("alerts.create")} />
        {!recent.length ? (
          <p className="text-muted text-sm">{t("results.emptyBody")}</p>
        ) : (
          <div className="space-y-4">
            <Field label={t("common.search")} htmlFor="alert-search">
              <Select id="alert-search" value={String(selected)} onChange={(e) => setSelected(Number(e.target.value))}>
                {recent.map((entry, i) => (
                  <option key={entry.id} value={i}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("alerts.target")} htmlFor="alert-target">
              <Input
                id="alert-target"
                inputMode="numeric"
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              label={t("alerts.channels") + " — " + (locale === "ar" ? "البريد الإلكتروني" : "email")}
              description={t("alerts.created")}
            />
            <Button
              loading={busy}
              disabled={!consent || !target || !source}
              onClick={async () => {
                if (!source) return;
                setBusy(true);
                const res = await api<PriceAlert>("/api/price-alerts", {
                  method: "POST",
                  body: JSON.stringify({
                    destinationId: source.intent.destinationId,
                    destinationLabel: source.intent.destinationDisplay,
                    checkIn: source.intent.checkIn,
                    checkOut: source.intent.checkOut,
                    rooms: source.intent.rooms,
                    targetPrice: Number(target),
                    currency,
                    channels: ["email"],
                    consent,
                  }),
                });
                setBusy(false);
                if (res.ok) {
                  setCreated(true);
                  track("price_alert_created", { target: Number(target) });
                  void load();
                }
              }}
            >
              {t("alerts.create")}
            </Button>
            {created && <Alert tone="success">{t("alerts.created")}</Alert>}
          </div>
        )}
      </Card>

      <section>
        <SectionHeading title={t("alerts.title")} />
        {!alerts.length && <EmptyState title={t("alerts.empty")} />}
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="font-medium">{alert.destinationLabel}</span>
                  <span className="text-muted block text-xs">
                    {alert.checkIn} → {alert.checkOut} · ≤ {alert.targetPrice} {alert.currency}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={alert.status === "active" ? "positive" : "neutral"}>{alert.status}</Badge>
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={async () => {
                      await api(`/api/price-alerts?id=${alert.id}`, { method: "DELETE" });
                      void load();
                    }}
                  >
                    {t("alerts.unsubscribe")}
                  </Button>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
