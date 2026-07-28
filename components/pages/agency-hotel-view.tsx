"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { Money, Nothing, PageHeader, Section, TableSkeleton, TradePrices } from "@/components/agency/ui";
import { Alert, Badge, Button, Card, Modal, cx } from "@/components/ui";
import { Icon, amenityIcon } from "@/components/ui/icons";
import { formatDate, formatDeadline, nightsBetween } from "@/lib/format";
import { href } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type { CanonicalHotel, CanonicalRoom, Locale, Offer, SearchIntent } from "@/lib/types";

/**
 * A property, as an agent needs to see it before selling it.
 *
 * The search row carries one rate — the cheapest the supplier offered — and an
 * agent was expected to sell from that alone. Real trade does not work that
 * way: the customer wants a twin rather than a double, or breakfast, or a rate
 * they can cancel, and each of those is a different rate at a different margin.
 *
 * So every room and every rate is here, each priced through the agency's own
 * commission and markup. The screen is supplier-agnostic by construction — it
 * asks the availability endpoint for a slug and that endpoint already knows
 * whether the slug is demo inventory, Hotelbeds or TourMind.
 */
export function AgencyHotelView({
  locale,
  slug,
  intent,
}: {
  locale: Locale;
  slug: string;
  intent: SearchIntent | null;
}) {
  return (
    <PortalShell locale={locale}>
      {() => <HotelDetail locale={locale} slug={slug} intent={intent} />}
    </PortalShell>
  );
}

interface Availability {
  hotel: CanonicalHotel | null;
  rooms: CanonicalRoom[];
  offers: Offer[];
}

function HotelDetail({
  locale,
  slug,
  intent,
}: {
  locale: Locale;
  slug: string;
  intent: SearchIntent | null;
}) {
  const { t } = useApp();
  const router = useRouter();
  const [data, setData] = useState<Availability | null | "missing">(null);
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});
  const [basket, setBasket] = useState<string[]>([]);
  const [gallery, setGallery] = useState<CanonicalRoom | null>(null);

  useEffect(() => {
    if (!intent) {
      setData("missing");
      return;
    }
    void (async () => {
      const res = await fetch(`/api/hotels/${encodeURIComponent(slug)}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ intent }),
      });
      const body = (await res.json()) as { ok: boolean; data?: Availability };
      if (!body.ok || !body.data?.hotel) {
        setData("missing");
        return;
      }
      setData(body.data);

      // One quote call for every rate on the page, not one per row.
      const offerIds = body.data.offers.map((offer) => offer.offerId);
      if (!offerIds.length) return;
      const priced = await fetch("/api/agency/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ offerIds }),
      });
      const pricedBody = (await priced.json()) as { ok: boolean; data?: { quotes: AgencyOfferView[] } };
      if (pricedBody.ok && pricedBody.data) {
        setQuotes(Object.fromEntries(pricedBody.data.quotes.map((q) => [q.offerId, q])));
      }
    })();
  }, [slug, intent]);

  if (data === null) return <TableSkeleton rows={4} />;
  if (data === "missing" || !data.hotel) {
    return (
      <div className="space-y-4">
        <Alert tone="warning" title={t("agency.propertyGone")}>
          {t("agency.propertyGoneBody")}
        </Alert>
        <Link href={href(locale, "/agency/search")}>
          <Button>{t("agency.searchStays")}</Button>
        </Link>
      </div>
    );
  }

  const { hotel, rooms, offers } = data;
  const nights = intent ? nightsBetween(intent.checkIn, intent.checkOut) : 0;

  // Rooms in the order the supplier gave them, but only those that still have a
  // rate: an empty room block is a promise of availability we cannot keep.
  const byRoom = rooms
    .map((room) => ({ room, rates: offers.filter((offer) => offer.canonicalRoomId === room.canonicalRoomId) }))
    .filter((group) => group.rates.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link href={href(locale, "/agency/search")} className="text-muted text-sm underline">
            ← {t("agency.backToResults")}
          </Link>
        }
        title={hotel.name}
        description={`${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.country}`}
        actions={
          basket.length > 0 ? (
            <Button onClick={() => router.push(href(locale, `/agency/search?basket=${basket.join(",")}`))}>
              {t("agency.newQuote")} ({basket.length})
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {hotel.category > 0 && (
          <span className="text-caution-700 text-sm" aria-label={`${hotel.category} stars`}>
            {"★".repeat(Math.round(hotel.category))}
          </span>
        )}
        <Badge tone="neutral">{hotel.propertyType}</Badge>
        {hotel.review && (
          <Badge tone="positive">
            {hotel.review.score}/{hotel.review.scale}
          </Badge>
        )}
        {intent && (
          <span className="text-muted text-sm">
            {formatDate(intent.checkIn, locale)} → {formatDate(intent.checkOut, locale)} · {nights}{" "}
            {nights === 1 ? t("common.night") : t("common.nights")}
          </span>
        )}
      </div>

      {hotel.amenities.length > 0 && (
        <div className="text-muted flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {hotel.amenities.slice(0, 10).map((amenity) => (
            <span key={amenity.code} className="inline-flex items-center gap-1">
              <Icon name={amenityIcon(amenity.code)} size={13} />
              {amenity.label}
            </span>
          ))}
        </div>
      )}

      {!byRoom.length && <Nothing icon="bed" title={t("agency.noRates")} body={t("agency.noRatesBody")} />}

      {byRoom.map(({ room, rates }) => (
        <Section
          key={room.canonicalRoomId}
          title={room.name}
          description={[
            room.sizeSqm ? `${room.sizeSqm} m²` : null,
            room.beds.map((bed) => `${bed.count} × ${bed.type}`).join(" + "),
            `${t("room.sleeps")} ${room.maxOccupancy}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            room.images.length > 0 ? (
              <button type="button" className="text-brand-700 text-sm underline" onClick={() => setGallery(room)}>
                {t("hotel.viewAllPhotos")} ({room.images.length})
              </button>
            ) : undefined
          }
        >
          {/*
            A property with an uncertain room match keeps its rates separate
            rather than merging them — the same warning the consumer site gives,
            because an agent selling the wrong room has a worse day than a
            traveller reading a vague description.
          */}
          {room.mappingConfidence < 0.8 && (
            <p className="text-caution-700 bg-caution-50 rounded-[var(--radius-control)] px-2.5 py-2 text-xs">
              {t("room.uncertainMatch")}
            </p>
          )}

          <ul className="space-y-2">
            {rates.map((offer) => {
              const quote = quotes[offer.offerId];
              const picked = basket.includes(offer.offerId);
              return (
                <li key={offer.offerId}>
                  <Card className={cx("p-4 transition-colors", picked && "border-brand-400 bg-brand-50/30")}>
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="neutral">{offer.board.label}</Badge>
                          {offer.badges.map((badge) => (
                            <Badge
                              key={badge.code}
                              tone={badge.kind === "promotional" ? "sand" : "positive"}
                            >
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                        <p
                          className={cx(
                            "text-xs",
                            offer.cancellation.refundable ? "text-positive-700" : "text-critical-700",
                          )}
                        >
                          {offer.cancellation.refundable && offer.cancellation.freeUntil
                            ? t("rate.freeUntil", {
                                date: formatDeadline(
                                  offer.cancellation.freeUntil,
                                  offer.cancellation.timezone,
                                  locale,
                                ),
                                tz: offer.cancellation.timezone,
                              })
                            : t("rate.nonRefundable")}
                        </p>
                        {offer.remainingLabel && (
                          <p className="text-caution-700 text-xs font-medium">{offer.remainingLabel}</p>
                        )}
                        {offer.comments
                          .filter((comment) => comment.mandatory)
                          .map((comment) => (
                            <p key={comment.id} className="text-muted text-xs wrap-anywhere">
                              {comment.summary}
                            </p>
                          ))}
                      </div>

                      <div className="flex flex-col items-end gap-2.5">
                        {quote ? (
                          <TradePrices
                            cost={quote.cost}
                            sell={quote.sell}
                            margin={quote.margin}
                            currency={quote.currency}
                            locale={locale}
                            publicPrice={offer.price.total}
                          />
                        ) : (
                          <Money amount={offer.price.total} currency={offer.price.currency} locale={locale} size="lg" />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={picked ? "ghost" : "secondary"}
                            onClick={() =>
                              setBasket((prev) =>
                                picked ? prev.filter((id) => id !== offer.offerId) : [...prev, offer.offerId],
                              )
                            }
                          >
                            {picked && <Icon name="check" size={14} />}
                            {picked ? t("agency.inQuote") : t("agency.addToQuote")}
                          </Button>
                          <Button
                            size="sm"
                            variant="action"
                            onClick={() => router.push(href(locale, `/agency/book/${offer.offerId}`))}
                          >
                            {t("agency.book")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <Modal open={Boolean(gallery)} onClose={() => setGallery(null)} title={gallery?.name ?? ""} size="lg">
        <ul className="grid gap-3 sm:grid-cols-2">
          {(gallery?.images ?? []).map((image) => (
            <li key={image.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                srcSet={image.srcSet}
                sizes="(min-width: 640px) 33vw, 100vw"
                alt={image.alt}
                className="aspect-[4/3] w-full rounded-[var(--radius-card)] object-cover"
              />
              <p className="text-muted mt-1 text-xs">{image.caption}</p>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
