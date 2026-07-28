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
import type { CheckoutSession, CurrencyCode, Locale, RecheckResult } from "@/lib/types";

interface GuestField {
  roomIndex: number;
  type: "adult" | "child";
  firstName: string;
  surname: string;
  age?: number;
}

/**
 * One field per occupant the lead guest does not cover.
 *
 * The lead is the first adult of the first room, so that seat is skipped;
 * everyone else — the second adult, the children, every occupant of every
 * further room — needs a name of their own.
 */
function seedGuests(rooms: { adults: number; childrenAges: number[] }[]): GuestField[] {
  const fields: GuestField[] = [];
  rooms.forEach((room, roomIndex) => {
    const adults = roomIndex === 0 ? room.adults - 1 : room.adults;
    for (let i = 0; i < adults; i += 1) {
      fields.push({ roomIndex, type: "adult", firstName: "", surname: "" });
    }
    room.childrenAges.forEach((age) => {
      fields.push({ roomIndex, type: "child", firstName: "", surname: "", age });
    });
  });
  return fields;
}

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
  /**
   * Every occupant after the lead.
   *
   * This used to be sent as an empty array, which meant a two-room booking
   * reached the supplier naming one person — the second room had no occupants
   * at all. A property cannot check in a guest it has never been told about,
   * and for some suppliers the order is simply rejected.
   */
  const [others, setOthers] = useState<GuestField[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * What the supplier said when we last asked whether this rate still stands.
   *
   * The consumer checkout has always done this before taking a card. The trade
   * checkout did not, which meant an agency could be committed — and a customer
   * quoted — at a price the supplier had already moved. Credit is money just as
   * much as a card is.
   */
  const [recheck, setRecheck] = useState<RecheckResult | null>(null);
  const [rechecking, setRechecking] = useState(false);

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
      setOthers(seedGuests(body.data.rooms));

      const priced = await fetch("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerIds: [offerId] }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data?.quotes.length) setQuote(pricedBody.data.quotes[0]);

      // Ask the supplier whether the rate still stands, before the agent has
      // read a price out to anyone.
      setRechecking(true);
      const refreshed = await fetch("/api/rates/recheck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerId, checkoutSessionId: body.data.checkoutSessionId }),
      });
      const refreshedBody = (await refreshed.json()) as { ok: boolean; data?: RecheckResult };
      setRechecking(false);
      if (refreshedBody.ok && refreshedBody.data) setRecheck(refreshedBody.data);
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

  /**
   * Take the refreshed rate.
   *
   * Accepting commits the new price to the checkout session and re-prices the
   * agency's cost from it, so the credit committed and the margin quoted both
   * describe the rate that actually exists.
   */
  async function acceptChange() {
    if (!session || session === "gone") return;
    setRechecking(true);
    setError(null);
    const res = await fetch("/api/rates/recheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ offerId, checkoutSessionId: session.checkoutSessionId, accept: true }),
    });
    const body = (await res.json()) as { ok: boolean; data?: RecheckResult };
    if (!body.ok || !body.data) {
      setRechecking(false);
      setError(t("error.temporaryService"));
      return;
    }

    const current = body.data.current;
    if (current) {
      setSession({ ...session, price: current.price, cancellation: current.cancellation });
      const priced = await fetch("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerIds: [offerId] }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data?.quotes.length) setQuote(pricedBody.data.quotes[0]);
    }
    setRecheck({ ...body.data, requiresAcceptance: false });
    setRechecking(false);
  }

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
        guests: others.map((guest) => ({
          roomIndex: guest.roomIndex,
          type: guest.type,
          firstName: guest.firstName,
          // A surname left blank follows the lead guest's, which is what a
          // family booking almost always means and what the API already
          // assumes if we say nothing.
          surname: guest.surname || surname,
          age: guest.type === "child" ? guest.age : undefined,
        })),
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

          {others.length > 0 && (
            <Card className="space-y-3 p-5">
              <h2 className="font-semibold">{t("agency.otherGuests")}</h2>
              <p className="text-muted text-sm">{t("agency.otherGuestsBody")}</p>
              <ul className="space-y-3">
                {others.map((guest, index) => (
                  <li key={index} className="grid items-end gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                    <p className="text-muted pb-2 text-xs">
                      {t("agency.roomN", { n: guest.roomIndex + 1 })}
                    </p>
                    <Field label={t("agency.firstName")} htmlFor={`g-first-${index}`}>
                      <Input
                        id={`g-first-${index}`}
                        value={guest.firstName}
                        onChange={(e) =>
                          setOthers((prev) =>
                            prev.map((g, i) => (i === index ? { ...g, firstName: e.target.value } : g)),
                          )
                        }
                      />
                    </Field>
                    <Field label={t("agency.surname")} htmlFor={`g-last-${index}`}>
                      <Input
                        id={`g-last-${index}`}
                        placeholder={surname || undefined}
                        value={guest.surname}
                        onChange={(e) =>
                          setOthers((prev) =>
                            prev.map((g, i) => (i === index ? { ...g, surname: e.target.value } : g)),
                          )
                        }
                      />
                    </Field>
                    {guest.type === "child" ? (
                      <Field label={t("common.age")} htmlFor={`g-age-${index}`}>
                        <Input
                          id={`g-age-${index}`}
                          type="number"
                          min={0}
                          max={17}
                          className="w-20"
                          value={String(guest.age ?? 0)}
                          onChange={(e) =>
                            setOthers((prev) =>
                              prev.map((g, i) => (i === index ? { ...g, age: Number(e.target.value) } : g)),
                            )
                          }
                        />
                      </Field>
                    ) : (
                      <span className="text-muted pb-2 text-xs">{t("common.adults")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

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

            {/*
              The rate is re-confirmed with the supplier before any credit
              moves. An adverse change is never absorbed silently — the agent
              has to see the new figure, because they have probably already
              said the old one out loud.
            */}
            {rechecking && <p className="text-muted text-xs">{t("agency.checkingRate")}</p>}

            {recheck?.outcome === "unavailable" && (
              <Alert tone="critical" title={t("agency.rateGone")}>
                {t("agency.rateGoneBody")}
              </Alert>
            )}

            {recheck?.requiresAcceptance && recheck.current && (
              <Alert tone="warning" title={t("agency.rateMoved")}>
                <p className="text-sm">
                  {t("agency.rateMovedBody", {
                    from: formatMoney(recheck.previous.price.total, currency, locale),
                    to: formatMoney(recheck.current.price.total, currency, locale),
                  })}
                </p>
                {recheck.changeReasons.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
                    {recheck.changeReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
                <Button size="sm" className="mt-2" onClick={acceptChange} loading={rechecking}>
                  {t("agency.acceptNewRate")}
                </Button>
              </Alert>
            )}

            {recheck?.outcome === "unchanged" && (
              <p className="text-positive-700 text-xs">{t("agency.rateHolds")}</p>
            )}

            {!affordable && <Alert tone="critical">{t("agency.creditExceeded")}</Alert>}
            {error && <Alert tone="critical">{error}</Alert>}

            <Button
              onClick={book}
              loading={busy}
              disabled={
                !accepted ||
                !firstName.trim() ||
                !surname.trim() ||
                // A property cannot check in a guest we never named.
                others.some((guest) => !guest.firstName.trim()) ||
                !affordable ||
                rechecking ||
                // A rate that has moved or vanished cannot be sold until the
                // agent has dealt with it.
                recheck?.requiresAcceptance === true ||
                recheck?.outcome === "unavailable"
              }
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
