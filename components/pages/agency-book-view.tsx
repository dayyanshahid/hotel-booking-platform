"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { Alert, Button, Card, Checkbox, Field, Input, SectionHeading, Skeleton } from "@/components/ui";
import { formatDate, formatDeadline, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CheckoutSession, CurrencyCode, Locale } from "@/lib/types";

/**
 * Booking on account.
 *
 * The consumer checkout asks for a card and a stack of consents from the person
 * travelling. Neither fits here: the agency pays us on terms, and the person
 * travelling is not in the room — the agent is, with them on the phone. So this
 * screen asks for what an agent can actually answer, shows what the booking
 * does to their credit before they commit, and states plainly that the
 * conditions are being accepted on the customer's behalf.
 */
export function AgencyBookView({ locale, offerId }: { locale: Locale; offerId: string }) {
  return (
    <PortalShell locale={locale}>
      {(context) => <TradeCheckout locale={locale} offerId={offerId} context={context} />}
    </PortalShell>
  );
}

function TradeCheckout({
  locale,
  offerId,
  context,
}: {
  locale: Locale;
  offerId: string;
  context: AgencyContext;
}) {
  const { t } = useApp();
  const router = useRouter();

  const [session, setSession] = useState<CheckoutSession | null | "gone">(null);
  const [quote, setQuote] = useState<AgencyOfferView | null>(null);
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/checkout/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerId }),
      });
      const body = (await res.json()) as { ok: boolean; data?: CheckoutSession };
      if (!body.ok || !body.data) {
        setSession("gone");
        return;
      }
      setSession(body.data);

      const priced = await fetch("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerIds: [offerId] }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data?.quotes.length) setQuote(pricedBody.data.quotes[0]);
    })();
  }, [offerId]);

  if (session === null) return <Skeleton className="h-64 w-full" />;
  if (session === "gone") {
    return (
      <Alert tone="warning" title={t("checkout.expired")}>
        <Button size="sm" variant="secondary" onClick={() => router.push(href(locale, "/agency/search"))}>
          {t("agency.searchStays")}
        </Button>
      </Alert>
    );
  }

  const currency = session.price.currency as CurrencyCode;
  const balance = context.balance;
  const cost = quote?.cost ?? 0;
  const afterwards = balance ? balance.available - cost : 0;
  const affordable = !balance || cost <= balance.available;

  async function book() {
    if (!session || session === "gone") return;
    setBusy(true);
    setError(null);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        checkoutSessionId: session.checkoutSessionId,
        // Derived from the session, so a double-submit lands on the same order.
        idempotencyKey: `agency-${session.checkoutSessionId}`,
        contact: {
          // The agency owns the relationship, so the booking is reachable from
          // their own inbox. The traveller's address goes in the remarks only
          // if the agent chose to give us one.
          email: context.session.email,
          phone: customerPhone || context.agency.profile.phone || "+0000000",
          language: locale,
        },
        lead: { firstName, surname },
        guests: [],
        requests: {
          remarks: [reference && `${t("agency.agencyReference")}: ${reference}`, remarks, customerEmail]
            .filter(Boolean)
            .join(" | "),
        },
        consents: { terms: true, cancellation: true, localFees: true, mandatory: true, marketing: false },
        payment: { method: "credit", token: "account", threeDsStatus: "notRequired" },
      }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { booking: { reference: string } };
      error?: { message: string };
    };
    setBusy(false);
    if (!body.ok || !body.data) {
      setError(body.error?.message ?? t("error.temporaryService"));
      return;
    }
    refreshAgency();
    router.push(href(locale, `/agency/bookings/${body.data.booking.reference}`));
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={t("agency.bookOnAccount")} description={t("agency.bookOnAccountBody")} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">{t("agency.leadGuest")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("agency.firstName")} htmlFor="bk-first">
                <Input id="bk-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label={t("agency.surname")} htmlFor="bk-last">
                <Input id="bk-last" value={surname} onChange={(e) => setSurname(e.target.value)} />
              </Field>
              <Field label={t("agency.customerEmail")} htmlFor="bk-email">
                <Input
                  id="bk-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </Field>
              <Field label={t("agency.phone")} htmlFor="bk-phone">
                <Input id="bk-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </Field>
              <Field label={t("agency.agencyReference")} htmlFor="bk-ref">
                <Input id="bk-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Field label={t("checkout.freeText")} htmlFor="bk-remarks">
                <Input id="bk-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">{t("rate.conditions")}</h2>
            <p className={session.cancellation.refundable ? "text-positive-700 text-sm" : "text-critical-700 text-sm"}>
              {session.cancellation.refundable && session.cancellation.freeUntil
                ? t("rate.freeUntil", {
                    date: formatDeadline(session.cancellation.freeUntil, session.cancellation.timezone, locale),
                    tz: session.cancellation.timezone,
                  })
                : t("rate.nonRefundable")}
            </p>
            {session.comments
              .filter((c) => c.mandatory)
              .map((comment) => (
                <p key={comment.id} className="text-muted text-sm wrap-anywhere">
                  {comment.summary}
                </p>
              ))}
            <Checkbox
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              label={t("agency.acceptOnBehalf")}
              description={t("agency.acceptOnBehalfBody")}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold wrap-anywhere">{session.hotelName}</h2>
            <p className="text-muted text-sm">
              {formatDate(session.checkIn, locale)} → {formatDate(session.checkOut, locale)}
            </p>
            <p className="text-muted text-sm wrap-anywhere">
              {session.rooms.length} × {session.roomName} · {session.boardLabel}
            </p>

            <dl className="hairline space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{t("agency.public")}</dt>
                <dd>{formatMoney(session.price.total, currency, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("agency.cost")}</dt>
                <dd className="font-semibold">{quote ? formatMoney(quote.cost, currency, locale) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("agency.sell")}</dt>
                <dd className="font-semibold">{quote ? formatMoney(quote.sell, currency, locale) : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t("agency.margin")}</dt>
                <dd className="text-positive-700 font-semibold">
                  {quote ? formatMoney(quote.margin, currency, locale) : "—"}
                </dd>
              </div>
            </dl>

            {balance && (
              <div className="hairline space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{t("agency.creditAvailable")}</dt>
                  <dd>{formatMoney(balance.available, balance.currency as CurrencyCode, locale)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{t("agency.creditAfter")}</dt>
                  <dd className={afterwards < 0 ? "text-critical-700 font-semibold" : "font-semibold"}>
                    {formatMoney(Math.max(0, afterwards), balance.currency as CurrencyCode, locale)}
                  </dd>
                </div>
              </div>
            )}

            {!affordable && <Alert tone="critical">{t("agency.creditExceeded")}</Alert>}
            {error && <Alert tone="critical">{error}</Alert>}

            <Button
              onClick={book}
              loading={busy}
              disabled={!accepted || !firstName.trim() || !surname.trim() || !affordable}
              className="w-full"
            >
              {t("agency.confirmOnAccount")}
            </Button>
            <p className="text-muted text-xs">{t("agency.noCardNote")}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
