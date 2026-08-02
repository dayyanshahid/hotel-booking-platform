"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";
import { Alert, Badge, Button, Skeleton, cx } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { useCart } from "@/components/agency/cart";
import { apiCredentials, apiUrl } from "@/lib/api-origin";
import { formatDeadline, formatMoney, nightsBetween } from "@/lib/format";
import { guestLabel, roomLabel } from "@/lib/i18n";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
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

interface AvailabilityPayload {
  hotel: { name: string; slug: string } | null;
  rooms: CanonicalRoom[];
  offers: Offer[];
}

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
  const [failed, setFailed] = useState(false);
  const [openRooms, setOpenRooms] = useState<Set<string>>(new Set());

  const nights = nightsBetween(intent.checkIn, intent.checkOut);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(apiUrl(`/api/hotels/${encodeURIComponent(slug)}/availability`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: apiCredentials(),
        body: JSON.stringify({ intent }),
      });
      const body = (await res.json()) as { ok: boolean; data?: AvailabilityPayload };
      if (!body.ok || !body.data) {
        setFailed(true);
        return;
      }
      setPayload(body.data);

      /*
       * One pricing call for the whole sheet.
       *
       * A rate without the agency's cost beside it is the public price, which
       * is the one number an agent must never quote — so the sheet is priced
       * in a single request rather than a request per line.
       */
      const offerIds = body.data.offers.map((o) => o.offerId);
      if (!offerIds.length) return;
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
      setFailed(true);
    } finally {
      setLoading(false);
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
                    <span className="text-brand-700 underline">{t("agency.rateCount", { count: offers.length })}</span>
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-end">
                    <span className="block text-sm font-bold">
                      {cheapestQuote
                        ? formatMoney(cheapestQuote.sell, cheapestQuote.currency as CurrencyCode, locale)
                        : formatMoney(cheapest.price.total, cheapest.price.currency as CurrencyCode, locale)}
                    </span>
                    <span className="text-muted block text-[11px]">{t("agency.fromPerStay")}</span>
                  </span>
                  <Icon name="chevronDown" size={18} className={cx("transition-transform", open && "rotate-180")} />
                </span>
              </button>

              {open && (
                <BoardGroups
                  offers={offers}
                  quotes={quotes}
                  locale={locale}
                  nights={nights}
                  canIssue={canIssue}
                  onAdd={(offer, quote) =>
                    cart.add({
                      offerId: offer.offerId,
                      hotelSlug: slug,
                      hotelName,
                      roomName: room.name,
                      boardLabel: offer.board.label,
                      refundable: offer.cancellation.refundable,
                      sell: quote?.sell ?? offer.price.total,
                      currency: (quote?.currency ?? offer.price.currency) as CurrencyCode,
                      nights,
                      roomsCovered: offer.roomsCovered,
                      expiresAt: offer.expiresAt,
                    })
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

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
  locale,
  nights,
  canIssue,
  onAdd,
}: {
  offers: Offer[];
  quotes: Record<string, AgencyOfferView>;
  locale: Locale;
  nights: number;
  canIssue: boolean;
  onAdd: (offer: Offer, quote?: AgencyOfferView) => void;
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

  return (
    <div className="mt-3 space-y-3">
      {boards.map((board) => (
        <div key={board.code} className="grid gap-2 sm:grid-cols-[minmax(0,170px)_1fr]">
          <p className="pt-1 text-sm font-semibold wrap-anywhere">
            {board.label}
            {board.code && <span className="text-muted font-normal"> ({board.code})</span>}
          </p>

          <ul className="hairline space-y-0 border-s ps-3">
            {board.offers.map((offer) => {
              const quote = quotes[offer.offerId];
              return (
                <li
                  key={offer.offerId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2"
                >
                  <div className="min-w-0 space-y-1 text-xs">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={offer.cancellation.refundable ? "positive" : "neutral"}>
                        {offer.cancellation.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                      </Badge>
                      {/* The date it stops being free, not just the word. An
                          agent quoting "free cancellation" without the deadline
                          is quoting half a rate. */}
                      {offer.cancellation.refundable && offer.cancellation.freeUntil && (
                        <span className="text-positive-700">
                          {t("rate.freeUntil", {
                            date: formatDeadline(offer.cancellation.freeUntil, offer.cancellation.timezone, locale),
                            // The property's own clock, named. "Until 22 Aug,
                            // 19:00" in an unstated zone is a deadline an agent
                            // can miss by a working day.
                            tz: offer.cancellation.timezone,
                          })}
                        </span>
                      )}
                      {offer.remainingLabel && (
                        <span className="text-caution-700 font-medium">{offer.remainingLabel}</span>
                      )}
                    </p>
                    {offer.roomsCovered > 1 && (
                      <p className="text-muted">{t("agency.rateCoversRooms", {
                          rooms: offer.roomsCovered,
                          unit: roomLabel(t, offer.roomsCovered, locale),
                        })}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      {quote ? (
                        <>
                          <p className="text-sm font-bold">{formatMoney(quote.sell, quote.currency as CurrencyCode, locale)}</p>
                          <p className="text-muted text-[11px]">
                            {t("agency.costAndMargin", {
                              cost: formatMoney(quote.cost, quote.currency as CurrencyCode, locale),
                              margin: formatMoney(quote.margin, quote.currency as CurrencyCode, locale),
                            })}
                          </p>
                        </>
                      ) : (
                        // Never the public price dressed as the agency's. If the
                        // quote did not arrive, the line says so.
                        <p className="text-muted text-xs">{t("agency.priceUnavailable")}</p>
                      )}
                      <p className="text-muted text-[11px]">
                        {nights} {nights === 1 ? t("common.night") : t("common.nights")}
                      </p>
                    </div>

                    {canIssue && (
                      <Button size="sm" onClick={() => onAdd(offer, quote)}>
                        <Icon name="cart" size={14} />
                        {t("agency.add")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
