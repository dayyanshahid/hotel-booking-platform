"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Skeleton, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { useCart } from "@/components/agency/cart";
import { PriceDetailsModal, RoomDetailsModal } from "@/components/agency/rate-panels";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { formatDeadline, formatMoney, nightsBetween } from "@/lib/format";
import { guestLabel, roomLabel } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import { claimShelf, type AvailabilityPayload } from "@/lib/agency/shelf-prefetch";
import type { CanonicalRoom, CurrencyCode, Locale, Offer, SearchIntent } from "@/lib/types";

/**
 * Every rate a property has, without leaving the results list.
 *
 * The portal used to send an agent to a property page to see anything beyond
 * the cheapest rate — one property per page load, back button, lose your place,
 * repeat. That is the wrong shape for the job: an agent on the phone is reading
 * options aloud and comparing boards and cancellation terms across two or three
 * properties at once, and the comparison is the work.
 *
 * So the whole rate sheet opens in place: rooms, and under each room every rate
 * grouped by what it includes, with what the agency pays and what it charges on
 * each line. The property page still exists for the things a page is for —
 * photographs, facilities, the address — and the card links to it plainly.
 *
 * Loaded only when opened. A results page holds twelve properties and fetching
 * every rate sheet up front would be twelve availability calls against a
 * supplier allowance, to answer a question nobody asked.
 */

export function RateShelf({
  slug,
  hotelName,
  intent,
  locale,
  canIssue,
}: {
  slug: string;
  hotelName: string;
  intent: SearchIntent;
  locale: Locale;
  /** A view-only account reads rates; it does not put them on the account. */
  canIssue: boolean;
}) {
  const { t } = useApp();
  const cart = useCart();
  const [payload, setPayload] = useState<AvailabilityPayload | null>(null);
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  const [loading, setLoading] = useState(true);
  /**
   * The rates are here; what they cost the agency is not, yet.
   *
   * Two supplier round-trips stand between "View rooms" and a bookable line —
   * availability, then our own pricing of it — and they used to be one wait
   * with one skeleton over the whole sheet. Measured three seconds after
   * opening, the sheet still had zero rate rows on it: the rooms had arrived
   * and were being held back until their prices caught up.
   *
   * Kept apart from `failed` because they mean different things to an agent. A
   * price still arriving is worth a second; a price that failed is worth
   * pressing retry, and the sheet said the second when it meant the first.
   */
  const [pricing, setPricing] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());
  /**
   * The panel an agent has opened over the sheet.
   *
   * One at a time and held here rather than per row: a rate line is a flex
   * container with four things in it already, and giving each one its own
   * modal state mounts a dialog per rate — thirty-seven of them on the
   * property this was built against.
   */
  const [priceFor, setPriceFor] = useState<Offer | null>(null);
  const [roomFor, setRoomFor] = useState<CanonicalRoom | null>(null);

  const nights = nightsBetween(intent.checkIn, intent.checkOut);

  const load = useCallback(async () => {
    setLoading(true);
    setPricing(true);
    setFailed(false);
    let rooms: AvailabilityPayload | null = null;
    try {
      /*
       * If the agent hovered the button before pressing it, this request is
       * already in flight and we join it rather than starting a second one.
       */
      const warm = claimShelf(slug, intent);
      if (warm) {
        rooms = await warm;
      } else {
        const res = await fetch(apiUrl(`/api/hotels/${encodeURIComponent(slug)}/availability`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: apiCredentials(),
          body: JSON.stringify({ intent }),
        });
        const body = (await res.json()) as { ok: boolean; data?: AvailabilityPayload };
        rooms = body.ok && body.data ? body.data : null;
      }
      if (!rooms) {
        setFailed(true);
        return;
      }
      setPayload(rooms);
    } catch {
      setFailed(true);
      return;
    } finally {
      /*
       * The rooms go up the moment they exist, rather than waiting on the
       * pricing call behind them. An agent reading a room name and a
       * cancellation deadline is already doing something useful, and the
       * numbers land underneath a second later.
       */
      setLoading(false);
      if (!rooms) setPricing(false);
    }

    /*
     * One pricing call for the whole sheet.
     *
     * A rate without the agency's cost beside it is the public price, which
     * is the one number an agent must never quote — so the sheet is priced
     * in a single request rather than a request per line.
     */
    const offerIds = rooms.offers.map((o) => o.offerId);
    if (!offerIds.length) {
      setPricing(false);
      return;
    }
    try {
      const priced = await fetch(apiUrl("/api/agency/quote"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: apiCredentials(),
        body: JSON.stringify({ offerIds }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data) {
        setQuotes(Object.fromEntries(pricedBody.data.quotes.map((q) => [q.offerId, q])));
      }
    } catch {
      /*
       * Not `failed`: the rooms are on screen and are real. Only the money is
       * missing, and each line says so for itself rather than the whole sheet
       * being replaced by an error over rates that arrived perfectly well.
       */
    } finally {
      setPricing(false);
    }
  }, [slug, intent]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Rooms in the order the supplier sent them, each with its rates by price. */
  const rooms = useMemo(() => {
    if (!payload) return [];
    const byRoom = new Map<string, Offer[]>();
    for (const offer of payload.offers) {
      const list = byRoom.get(offer.canonicalRoomId) ?? [];
      list.push(offer);
      byRoom.set(offer.canonicalRoomId, list);
    }
    return payload.rooms
      .map((room) => ({
        room,
        offers: (byRoom.get(room.canonicalRoomId) ?? []).sort((a, b) => a.price.total - b.price.total),
      }))
      .filter((entry) => entry.offers.length > 0);
  }, [payload]);

  /**
   * The first room opens itself.
   *
   * Measured three seconds after pressing "View rooms", the sheet had zero rate
   * rows on it — and part of that was never loading at all: every room arrived
   * collapsed, so the agent who had just asked to see the rates was shown a
   * list of room names and had to ask again. On a fifteen-room property that is
   * a second click to reach the thing the first click was for.
   *
   * Only the first, and only once. Opening all fifteen would put four hundred
   * rates between the agent and the next property in the list, and re-applying
   * it on every render would fight an agent who has deliberately closed it.
   */
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const first = rooms[0]?.room.canonicalRoomId;
    if (!first || opened.current === first) return;
    opened.current = first;
    setOpenRooms(new Set([first]));
  }, [rooms]);

  const allOpen = rooms.length > 0 && openRooms.size === rooms.length;

  function toggleAll() {
    setOpenRooms(allOpen ? new Set() : new Set(rooms.map((r) => r.room.canonicalRoomId)));
  }

  function toggleRoom(id: string) {
    setOpenRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="px-4 py-4">
        <Alert tone="warning" title={t("agency.ratesUnavailable")}>
          <div className="flex flex-wrap items-center gap-3">
            <span>{t("agency.ratesUnavailableBody")}</span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (!rooms.length) {
    return <p className="text-muted px-4 py-5 text-sm">{t("agency.noRatesForStay")}</p>;
  }

  return (
    <div className="surface-sunken hairline border-t">
      <div className="flex justify-end px-4 pt-3">
        <Button variant="quiet" size="sm" onClick={toggleAll}>
          {allOpen ? t("agency.collapseAllRooms") : t("agency.expandAllRooms")}
        </Button>
      </div>

      <ul className="divide-y divide-[var(--border)] px-4 pb-4">
        {rooms.map(({ room, offers }) => {
          const open = openRooms.has(room.canonicalRoomId);
          const cheapest = offers[0];
          const cheapestQuote = quotes[cheapest.offerId];
          return (
            <li key={room.canonicalRoomId} className="py-3">
              {/* The room, as one scannable line. Everything an agent needs to
                  decide whether to open it: who it sleeps, how big, and what
                  the cheapest way into it costs the agency. */}
              <button
                type="button"
                onClick={() => toggleRoom(room.canonicalRoomId)}
                aria-expanded={open}
                className="flex w-full flex-wrap items-start justify-between gap-3 text-start"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold wrap-anywhere">
                    {t("agency.roomForGuests", {
                      room: room.name,
                      guests: room.maxOccupancy,
                      unit: guestLabel(t, room.maxOccupancy, locale),
                    })}
                  </span>
                  <span className="text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {room.sizeSqm ? (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="building" size={13} />
                        {room.sizeSqm} m²
                      </span>
                    ) : null}
                    {room.beds.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="bed" size={13} />
                        {room.beds.map((b) => `${b.count} × ${b.type}`).join(" / ")}
                      </span>
                    )}
                    <span className="text-brand-700">{t("agency.rateCount", { count: offers.length })}</span>
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-end">
                    {/*
                      The agency's number or none at all.

                      This fell back to `cheapest.price.total` — the public
                      price — under a "from, per stay" label, in the slot where
                      every other row on this screen puts the agency's sell.
                      For the second the pricing call is out, an agent reading
                      down the sheet would have read someone else's price as
                      theirs and quoted it. Waiting is honest; a dash is
                      honest; the wrong number wearing the right label is not.
                    */}
                    <span className="block text-sm font-bold">
                      {cheapestQuote ? (
                        formatMoney(cheapestQuote.sell, cheapestQuote.currency as CurrencyCode, locale)
                      ) : pricing ? (
                        <Skeleton className="h-4 w-16" />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </span>
                    <span className="text-muted block text-[11px]">{t("agency.fromPerStay")}</span>
                  </span>
                  <Icon name="chevronDown" size={18} className={cx("transition-transform", open && "rotate-180")} />
                </span>
              </button>

              {/* Beside the row rather than inside the toggle: nesting a button
                  in a button is invalid, and clicking it should open the room,
                  not close it. */}
              <button
                type="button"
                onClick={() => setRoomFor(room)}
                className="text-brand-700 mt-1 text-xs font-medium underline underline-offset-2"
              >
                {t("agency.roomDetails")}
              </button>

              {open && (
                <BoardGroups
                  offers={offers}
                  quotes={quotes}
                  pricing={pricing}
                  locale={locale}
                  canIssue={canIssue}
                  onPriceDetails={setPriceFor}
                  onAdd={(offer, quote) =>
                    cart.add({
                      offerId: offer.offerId,
                      hotelSlug: slug,
                      hotelName,
                      roomName: room.name,
                      boardLabel: offer.board.label,
                      refundable: offer.cancellation.refundable,
                      sell: quote?.sell ?? offer.price.total,
                      // Undefined rather than zero when the pricing call failed:
                      // the room is real and the agent may still want it, but the
                      // margin on it is genuinely unknown and must not read as none.
                      cost: quote?.cost,
                      margin: quote?.margin,
                      currency: (quote?.currency ?? offer.price.currency) as CurrencyCode,
                      nights,
                      roomsCovered: offer.roomsCovered,
                      allotment: offer.allotment,
                      expiresAt: offer.expiresAt,
                    })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      {priceFor && (
        <PriceDetailsModal
          open
          onClose={() => setPriceFor(null)}
          hotelName={hotelName}
          offer={priceFor}
          quote={quotes[priceFor.offerId]}
          checkIn={intent.checkIn}
          locale={locale}
        />
      )}

      {roomFor && (
        <RoomDetailsModal
          open
          onClose={() => setRoomFor(null)}
          hotelName={hotelName}
          room={roomFor}
          locale={locale}
        />
      )}

      <div className="hairline flex justify-center border-t px-4 py-3">
        <Link href={`${href(locale, `/agency/hotel/${slug}`)}?${new URLSearchParams({ from: "search" }).toString()}`}>
          <Button variant="quiet" size="sm">
            {t("agency.seePropertyDetails")}
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * The rates, gathered by what they include.
 *
 * Grouped by board because that is the axis an agent compares on — "room only
 * or with breakfast" is the question a customer asks, and listing eight rates
 * flat makes them find the pairs themselves. Within a board the differences are
 * cancellation and price, side by side on one line each.
 */
function BoardGroups({
  offers,
  quotes,
  pricing,
  locale,
  canIssue,
  onAdd,
  onPriceDetails,
}: {
  offers: Offer[];
  quotes: Record<string, AgencyOfferView>;
  /** The pricing call is still out, so a missing quote is not a failed one. */
  pricing: boolean;
  locale: Locale;
  canIssue: boolean;
  onAdd: (offer: Offer, quote?: AgencyOfferView) => void;
  /** Opens the night-by-night breakdown for one rate. */
  onPriceDetails: (offer: Offer) => void;
}) {
  const { t } = useApp();

  const boards = useMemo(() => {
    const map = new Map<string, { label: string; offers: Offer[] }>();
    for (const offer of offers) {
      const key = offer.board.code || offer.board.label;
      const entry = map.get(key) ?? { label: offer.board.label, offers: [] };
      entry.offers.push(offer);
      map.set(key, entry);
    }
    return [...map.entries()].map(([code, entry]) => ({ code, ...entry }));
  }, [offers]);

  /*
   * A table, not a stack of flex rows.
   *
   * Every rate has the same four things to say — what it includes, on what
   * terms, for how much, and a way to take it — and the old layout let each
   * one size itself. A row with a cancellation deadline grew taller than the
   * row beneath it, the price column drifted, and the Add buttons landed at
   * four different heights down a single board. An agent comparing eight rates
   * on a call was re-finding the price on every line.
   *
   * Fixed columns fix that. The money column is the same width for every rate
   * in the property, so the eye tracks one vertical line, and the button sits
   * where it sat on the row above.
   */
  return (
    <div className="mt-3 space-y-4">
      {boards.map((board) => (
        <section key={board.code}>
          <h4 className="text-sm font-semibold wrap-anywhere">
            {board.label}
            {board.code && <span className="text-muted font-normal"> ({board.code})</span>}
          </h4>

          <ul className="mt-1.5 divide-y divide-[var(--border)]">
            {board.offers.map((offer) => {
              const quote = quotes[offer.offerId];
              const refundable = offer.cancellation.refundable;
              return (
                <li
                  key={offer.offerId}
                  className={cx(
                    "grid items-center gap-x-4 gap-y-2 py-2.5",
                    // One column on a phone; on a laptop the money and the
                    // action are fixed so they align down the whole sheet.
                    "sm:grid-cols-[1fr_minmax(0,150px)_auto]",
                  )}
                >
                  {/* What you are agreeing to. */}
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <Badge tone={refundable ? "positive" : "neutral"}>
                        {refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                      </Badge>
                      {/* The date it stops being free, not just the word. An
                          agent quoting "free cancellation" without the deadline
                          is quoting half a rate. */}
                      {refundable && offer.cancellation.freeUntil && (
                        <span className="text-positive-700">
                          {t("rate.freeUntil", {
                            date: formatDeadline(
                              offer.cancellation.freeUntil,
                              offer.cancellation.timezone,
                              locale,
                            ),
                            tz: offer.cancellation.timezone,
                          })}
                        </span>
                      )}
                    </p>
                    <p className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      {offer.remainingLabel && (
                        <span className="text-caution-700 font-medium">{offer.remainingLabel}</span>
                      )}
                      {offer.roomsCovered > 1 && (
                        <span>
                          {t("agency.rateCoversRooms", {
                            rooms: offer.roomsCovered,
                            unit: roomLabel(t, offer.roomsCovered, locale),
                          })}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* The money, in its own column so it makes a line. */}
                  <div className="sm:text-end">
                    {quote ? (
                      <>
                        <p className="tabular text-base font-bold leading-tight">
                          {formatMoney(quote.sell, quote.currency as CurrencyCode, locale)}
                        </p>
                        <p className="text-muted tabular text-[11px]">
                          {t("agency.costAndMargin", {
                            cost: formatMoney(quote.cost, quote.currency as CurrencyCode, locale),
                            margin: formatMoney(quote.margin, quote.currency as CurrencyCode, locale),
                          })}
                        </p>
                      </>
                    ) : pricing ? (
                      // On its way. Saying "price unavailable" for the second
                      // it takes to arrive is a fault reported where there is
                      // none, on the number the agent is waiting for.
                      <span className="ms-auto flex flex-col items-end gap-1">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-3 w-24" />
                      </span>
                    ) : (
                      // Never the public price dressed as the agency's. If the
                      // quote did not arrive, the line says so.
                      <p className="text-muted text-xs">{t("agency.priceUnavailable")}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => onPriceDetails(offer)}
                      className="text-brand-700 text-[11px] font-medium hover:underline"
                    >
                      {t("agency.priceDetails")}
                    </button>
                  </div>

                  {canIssue && (
                    <AddControl offer={offer} quote={quote} pricing={pricing} onAdd={onAdd} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Add, and then how many.
 *
 * A group booking is the same rate taken more than once, so the second press
 * has to mean "another room at this rate" rather than "undo". What it must not
 * mean is more rooms than the supplier is holding: the checkout already
 * refuses that basket, and letting an agent build it only moves the refusal to
 * after they have quoted the customer.
 *
 * When the supplier stated no allotment the control is unbounded, because an
 * unknown is not a limit and inventing one would refuse bookings that would
 * have gone through.
 */
function AddControl({
  offer,
  quote,
  pricing,
  onAdd,
}: {
  offer: Offer;
  quote?: AgencyOfferView;
  /** Waiting on the cost, which is not the same as not having one. */
  pricing: boolean;
  onAdd: (offer: Offer, quote?: AgencyOfferView) => void;
}) {
  const { t } = useApp();
  const cart = useCart();
  const held = cart.quantityOf(offer.offerId);
  const room = cart.canAddMore(offer.offerId, offer.allotment);

  if (held === 0) {
    return (
      <Button
        size="sm"
        className="w-full sm:w-auto"
        /*
         * Present but not yet pressable while the cost is in flight. A rate
         * added without one goes into the basket with no margin behind it,
         * which is the number the whole screen exists to protect — and a
         * button that appears a second late is a button an agent reaches for
         * and misses.
         */
        disabled={pricing && !quote}
        onClick={() => onAdd(offer, quote)}
      >
        <Icon name="cart" size={14} />
        {t("agency.add")}
      </Button>
    );
  }

  return (
    <span className="hairline inline-flex items-center gap-1 rounded-[var(--radius-pill)] border p-1">
      <button
        type="button"
        onClick={() => cart.removeOne(offer.offerId)}
        aria-label={t("agency.removeOneRoom")}
        className="hover:surface-sunken size-8 rounded-full text-lg leading-none"
      >
        −
      </button>
      <span aria-live="polite" className="tabular min-w-8 text-center text-sm font-semibold">
        {held}
      </span>
      <button
        type="button"
        onClick={() => onAdd(offer, quote)}
        disabled={!room}
        aria-label={
          room ? t("agency.addOneRoom") : t("agency.noneLeftAtRate", { held: offer.allotment })
        }
        title={room ? undefined : t("agency.noneLeftAtRate", { held: offer.allotment })}
        className="hover:surface-sunken size-8 rounded-full text-lg leading-none disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}
