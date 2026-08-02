"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { may, refreshAgency, type AgencyContext } from "@/components/agency/use-agency";
import { canHold } from "@/lib/agency/hold-policy";
import { Alert, Button, Card, Checkbox, Field, Input, SectionHeading, Skeleton } from "@/components/ui";
import { formatDate, formatDeadline, formatMoney } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CheckoutSession, CurrencyCode, Locale, RecheckResult } from "@/lib/types";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { apiFetch } from "@/lib/api-client";

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
/**
 * The agency's cost, sell and margin across every room being booked.
 *
 * Trade pricing is per rate, so a three-room set comes back as three quotes.
 * Showing the first one put a third of the cost against the whole booking on the
 * one screen where the agent commits their credit line — and the credit gate on
 * the server prices the session total, so the two would have disagreed at the
 * moment it mattered most.
 */
function sumQuotes(quotes: AgencyOfferView[]): AgencyOfferView {
  return quotes.reduce((total, quote) => ({
    ...total,
    cost: total.cost + quote.cost,
    sell: total.sell + quote.sell,
    margin: total.margin + quote.margin,
  }));
}

/**
 * Rechecking a set: one call per distinct rate, and the least forgiving answer.
 *
 * CheckRate takes one rateKey per call, so a three-room set is up to three
 * calls — but three rooms at the same rate is one rateKey and therefore one
 * call, which is the ordinary group booking and the case worth not paying for
 * three times. It also matters against a fifty-a-day evaluation key.
 *
 * Only the lead line used to be rechecked. The other two could have moved, sold
 * out or changed their cancellation terms, and the agency's credit was committed
 * against prices nobody had confirmed. The combined answer takes the worst of
 * them: an agent who accepts is accepting for the whole set.
 */
const RECHECK_SEVERITY: Record<RecheckResult["outcome"], number> = {
  unavailable: 4,
  higher: 3,
  policyChanged: 2,
  lower: 1,
  unchanged: 0,
};

function worstRecheck(results: RecheckResult[]): RecheckResult | null {
  if (!results.length) return null;
  const worst = results.reduce((a, b) =>
    RECHECK_SEVERITY[b.outcome] > RECHECK_SEVERITY[a.outcome] ? b : a,
  );
  return {
    ...worst,
    // Any line needing a decision makes the set need one.
    requiresAcceptance: results.some((result) => result.requiresAcceptance),
    changeReasons: [...new Set(results.flatMap((result) => result.changeReasons))],
  };
}

/**
 * The URL segment carries every rate being booked, comma separated.
 *
 * One room is one id and reads exactly as it always did. A set is
 * `/agency/book/of_a,of_b,of_c` — the basket's own order — so the page is
 * linkable and survives a refresh, which a client-side basket handed to a
 * router does not.
 */
function offerIdsFrom(segment: string): string[] {
  /*
   * Decoded before it is split, not after.
   *
   * The router percent-encodes the separator, so the segment arrives as
   * `of_a%2Cof_b%2Cof_c`. Splitting first found no comma, decoded the whole
   * thing into one id with commas in it, and the checkout answered "this option
   * changed or sold out" — a rate that had never existed, described as one that
   * had just gone.
   */
  return decodeURIComponent(segment)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

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
  /**
   * Why the session could not be opened, in the server's own words.
   *
   * Every failure used to render as "your selection expired". A basket spanning
   * two hotels is refused for a reason the agent can act on — they picked rates
   * at three different properties — and being told the rates went stale instead
   * sends them back to re-pick the same three.
   */
  const [blocked, setBlocked] = useState<string | null>(null);
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
      const res = await fetch(apiUrl("/api/checkout/sessions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: apiCredentials(),
        body: JSON.stringify({ offerIds: offerIdsFrom(offerId) }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: CheckoutSession;
        error?: { message?: string };
      };
      if (!body.ok || !body.data) {
        setBlocked(body.error?.message ?? null);
        setSession("gone");
        return;
      }
      setSession(body.data);
      setOthers(seedGuests(body.data.rooms));

      const pricedBody = await apiFetch<{ quotes: AgencyOfferView[] }>("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerIds: offerIdsFrom(offerId) }),
      });
      if (pricedBody.ok && pricedBody.data?.quotes.length) setQuote(sumQuotes(pricedBody.data.quotes));

      // Ask the supplier whether the rate still stands, before the agent has
      // read a price out to anyone.
      setRechecking(true);
      const sessionId = body.data.checkoutSessionId;
      const distinct = [...new Set(offerIdsFrom(offerId))];
      const refreshed = await Promise.all(
        distinct.map(async (id) => {
          const parsed = await apiFetch<RecheckResult>("/api/rates/recheck", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ offerId: id, checkoutSessionId: sessionId }),
          });
          return parsed.ok ? (parsed.data ?? null) : null;
        }),
      );
      setRechecking(false);
      const combined = worstRecheck(refreshed.filter(Boolean) as RecheckResult[]);
      if (combined) setRecheck(combined);
    })();
  }, [offerId]);

  if (session === null) return <Skeleton className="h-64 w-full" />;
  if (session === "gone") {
    return (
      <Alert tone="warning" title={blocked ?? t("checkout.expired")}>
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
    const body = await apiFetch<RecheckResult>("/api/rates/recheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        offerId: offerIdsFrom(offerId)[0],
        checkoutSessionId: session.checkoutSessionId,
        accept: true,
      }),
    });
    if (!body.ok || !body.data) {
      setRechecking(false);
      setError(t("error.temporaryService"));
      return;
    }

    /*
     * The rest of the set, accepted too.
     *
     * Accepting the lead line and leaving the others un-committed would book two
     * rooms at prices nobody agreed to. Distinct rates only, so a set of three
     * identical rooms costs one more call rather than three.
     */
    const rest = [...new Set(offerIdsFrom(offerId))].slice(1);
    await Promise.all(
      rest.map((id) =>
        fetch(apiUrl("/api/rates/recheck"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: apiCredentials(),
          body: JSON.stringify({ offerId: id, checkoutSessionId: session.checkoutSessionId, accept: true }),
        }),
      ),
    );

    const current = body.data.current;
    if (current) {
      setSession({ ...session, price: current.price, cancellation: current.cancellation });
      const pricedBody = await apiFetch<{ quotes: AgencyOfferView[] }>("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerIds: offerIdsFrom(offerId) }),
      });
      if (pricedBody.ok && pricedBody.data?.quotes.length) setQuote(sumQuotes(pricedBody.data.quotes));
    }
    setRecheck({ ...body.data, requiresAcceptance: false });
    setRechecking(false);
  }

  /*
   * Whether this rate can be held at all.
   *
   * The same rule the server applies, so the button and the answer agree:
   * refundable, with a free-cancellation deadline still far enough away that a
   * hold could be released for nothing.
   */
  const holdable =
    may(context, "booking") &&
    canHold({
      refundable: session.cancellation.refundable,
      freeCancellationUntil: session.cancellation.freeUntil,
    }).ok;

  async function book(asHold = false) {
    if (!session || session === "gone") return;
    setBusy(true);
    setError(null);

    const res = await fetch(apiUrl("/api/bookings"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: apiCredentials(),
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
        /*
         * A hold is the same supplier order with different money.
         *
         * Neither supplier will hold a room without booking it, so this books
         * it — on a refundable rate only — and reserves the cost instead of
         * charging it. Something cancels it inside the free window unless an
         * issuer confirms it first.
         */
        hold: asHold,
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
            {/*
              One row per room actually being bought.
              This read `{session.rooms.length} × {session.roomName}` — "3 ×
              Deluxe twin" over a price that bought one, the same sentence the
              quote printed and the same way an agent found out at the counter.
            */}
            {session.lines.map((line) => (
              <p key={line.lineId} className="text-muted text-sm wrap-anywhere">
                {line.roomName} · {line.boardLabel}
              </p>
            ))}

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
              onClick={() => book(false)}
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

            {/*
              Holding is offered only when it is actually possible.
              A non-refundable rate cannot be held by either supplier, and
              showing the button anyway would be promising something we would
              then have to refuse.
            */}
            {holdable && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => book(true)}
                  loading={busy}
                  disabled={
                    !accepted ||
                    !firstName.trim() ||
                    !surname.trim() ||
                    others.some((guest) => !guest.firstName.trim()) ||
                    !affordable ||
                    rechecking ||
                    recheck?.requiresAcceptance === true ||
                    recheck?.outcome === "unavailable"
                  }
                  className="w-full"
                >
                  {t("agency.hold")}
                </Button>
                <p className="text-muted text-xs">{t("agency.holdHelp")}</p>
              </>
            )}

            <p className="text-muted text-xs">{t("agency.noCardNote")}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
