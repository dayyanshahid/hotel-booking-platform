"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Accordion, Badge, Button, Card, Modal, Photo, cx } from "@/components/ui";
import { Icon, amenityIcon } from "@/components/ui/icons";
import { CancellationTimeline, PriceBlock } from "./price";
import { TradeStrip } from "@/components/agency/trade-strip";
import { useAgencyQuotes } from "@/components/agency/use-agency";
import type { AgencyOfferView } from "@/lib/agency/types";
import { formatDeadline } from "@/lib/format";
import type { CanonicalRoom, Offer } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * How a rate is priced and acted on, when the audience is not a traveller.
 *
 * The trade portal shows the same rooms and the same rate conditions — that is
 * the point of one component — but the money reads differently (cost, sell and
 * margin against the struck public price) and the action is not "select" but
 * "put this in a quote" or "book it on the account".
 */
export interface TradeRate {
  /** Replaces the public price block for this rate. */
  price?: (offer: Offer, quote?: AgencyOfferView) => ReactNode;
  selectLabel?: string;
  /** An extra action beside the primary one, per rate. */
  secondary?: (offer: Offer) => ReactNode;
}

/**
 * F-041 — canonical room with its materially distinct rates.
 *
 * Rooms are grouped only when the mapping is confident; below the threshold the
 * UI states plainly that the options were kept separate (E-05). Raw supplier
 * wording is preserved but tucked behind the structured summary (§5.7).
 */
export function RoomBlock({
  room,
  offers,
  onSelect,
  selectedOfferId,
  busyOfferId,
  trade,
}: {
  room: CanonicalRoom;
  offers: Offer[];
  onSelect: (offer: Offer) => void;
  selectedOfferId?: string | null;
  busyOfferId?: string | null;
  trade?: TradeRate;
}) {
  const { t, locale } = useApp();
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Quoted per room block rather than per rate: one request covers every rate
  // on the room, and a signed-out visitor never issues it at all.
  const quotes = useAgencyQuotes(offers.map((offer) => offer.offerId));

  return (
    <Card as="li" className="overflow-hidden">
      <div className="grid lg:grid-cols-[280px_1fr]">
        <div className="p-3">
          <button type="button" onClick={() => setGalleryOpen(true)} className="block w-full text-start">
            <Photo
              src={room.images[0]?.url}
              srcSet={room.images[0]?.srcSet}
              sizes="(min-width: 1024px) 260px, 100vw"
              fallbackSrc={room.images[0]?.fallbackUrl}
              alt={room.images[0]?.alt ?? room.name}
              ratio="4/3"
              className="rounded-[14px]"
              fallbackLabel={t("hotel.imageFallback")}
            />
            <span className="text-brand-700 mt-1 inline-block text-xs font-medium">
              {t("hotel.viewAllPhotos")} ({room.images.length})
            </span>
          </button>
        </div>

        <div className="p-4 lg:ps-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold wrap-anywhere">{room.name}</h3>
              <p className="text-muted mt-1 inline-flex flex-wrap items-center gap-x-1.5 text-sm">
                <Icon name="bed" size={15} />
                {room.sizeSqm && <>{room.sizeSqm} m² · </>}
                {room.beds.map((b) => `${b.count} × ${b.type}`).join(" + ")} · {t("room.sleeps")}{" "}
                {room.maxOccupancy}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {room.view && <Badge tone="neutral">{room.view}</Badge>}
              {room.accessible && <Badge tone="brand">{t("room.accessible")}</Badge>}
              <Badge tone="neutral">{room.smoking ? t("room.smoking") : t("room.nonSmoking")}</Badge>
            </div>
          </div>

          <div className="text-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {room.amenities.slice(0, 6).map((a) => (
              <span key={a.code} className="inline-flex items-center gap-1">
                <Icon name={amenityIcon(a.code)} size={13} />
                {a.label}
              </span>
            ))}
            {room.extraBed && <span>{t("room.extraBed")}</span>}
            {room.cot && <span>{t("room.cot")}</span>}
          </div>

          {room.mappingConfidence < 0.8 && (
            <p className="text-caution-700 bg-caution-50 mt-3 rounded-[10px] px-2.5 py-2 text-xs">{t("room.uncertainMatch")}</p>
          )}

          <ul className="mt-4 space-y-3">
            {offers.map((offer) => (
              <RateRow
                key={offer.offerId}
                offer={offer}
                onSelect={onSelect}
                selected={selectedOfferId === offer.offerId}
                busy={busyOfferId === offer.offerId}
                quote={quotes[offer.offerId]}
                trade={trade}
              />
            ))}
          </ul>
        </div>
      </div>

      <Modal open={galleryOpen} onClose={() => setGalleryOpen(false)} title={room.name} size="lg">
        <ul className="grid gap-3 sm:grid-cols-2">
          {room.images.map((image) => (
            <li key={image.id}>
              <Photo
                src={image.url}
                srcSet={image.srcSet}
                sizes="(min-width: 640px) 33vw, 100vw"
                fallbackSrc={image.fallbackUrl}
                alt={image.alt}
                ratio="4/3"
                className="rounded-[14px]"
                fallbackLabel={t("hotel.imageFallback")}
              />
              <p className="text-muted mt-1 text-xs">
                {t("hotel.roomImagesLabel")} · {image.caption}
                {image.credit ? ` · ${image.credit}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-muted mt-3 text-xs">
          {locale === "ar"
            ? "الصور تخص هذه الفئة من الغرف وقد تختلف تفاصيل الغرفة الفعلية."
            : "Images show this room category; the exact room may differ in detail."}
        </p>
      </Modal>
    </Card>
  );
}

function RateRow({
  offer,
  onSelect,
  selected,
  busy,
  quote,
  trade,
}: {
  offer: Offer;
  onSelect: (offer: Offer) => void;
  selected: boolean;
  busy: boolean;
  quote?: AgencyOfferView;
  trade?: TradeRate;
}) {
  const { t, locale } = useApp();
  const [whyOpen, setWhyOpen] = useState<null | { label: string; reason: string }>(null);
  const mandatory = offer.comments.filter((c) => c.mandatory);

  return (
    <li
      className={cx(
        "hairline rounded-[var(--radius-control)] border p-3.5",
        selected ? "border-brand-500 bg-brand-50/40" : "surface",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{offer.board.label}</Badge>
            {offer.badges.map((badge) => (
              <button
                key={badge.code}
                type="button"
                onClick={() => setWhyOpen({ label: badge.label, reason: badge.reason })}
                className="inline-flex"
              >
                <Badge
                  tone={badge.kind === "promotional" ? "sand" : badge.kind === "recommendation" ? "brand" : "positive"}
                >
                  {badge.label} <span aria-hidden>ⓘ</span>
                </Badge>
              </button>
            ))}
          </div>

          <p className="text-muted mt-1.5 text-xs">{offer.board.detail}</p>

          <div className="mt-2">
            <CancellationTimeline policy={offer.cancellation} currency={offer.price.currency} compact />
          </div>

          <p className="text-muted mt-1 text-xs">
            {offer.paymentTiming === "payNow"
              ? t("rate.payNow")
              : offer.paymentTiming === "payAtProperty"
                ? t("rate.payAtProperty")
                : offer.payLaterBy
                  ? t("rate.payLaterBy", {
                      date: formatDeadline(offer.payLaterBy, offer.cancellation.timezone, locale),
                    })
                  : t("rate.payLater")}
          </p>

          {offer.remainingLabel && <p className="text-caution-700 mt-1 text-xs font-medium">{offer.remainingLabel}</p>}

          {offer.comments.length > 0 && (
            <div className="mt-3">
              <Accordion
                items={[
                  {
                    id: `${offer.offerId}-conditions`,
                    title: (
                      <span className="text-xs">
                        {t("rate.conditions")}
                        {mandatory.length > 0 && (
                          <Badge tone="caution" className="ms-2">
                            {mandatory.length}
                          </Badge>
                        )}
                      </span>
                    ),
                    content: (
                      <div className="space-y-3">
                        {offer.comments.map((comment) => (
                          <div key={comment.id}>
                            <p className="text-sm">{comment.summary}</p>
                            {comment.mandatory && (
                              <p className="text-caution-700 mt-0.5 text-xs font-medium">{t("rate.mandatory")}</p>
                            )}
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs underline">
                                {t("rate.conditionsFull")}
                              </summary>
                              <p className="text-muted mt-1 font-mono text-[11px] wrap-anywhere">{comment.verbatim}</p>
                            </details>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>

        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
          {trade?.price ? (
            trade.price(offer, quote)
          ) : (
            <>
              <PriceBlock price={offer.price} size="md" />
              {/* A traveller browsing with an agent session open still sees
                  their own trade figures under the public price. */}
              <TradeStrip quote={quote} className="w-full text-start sm:min-w-[260px]" />
            </>
          )}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {trade?.secondary?.(offer)}
            <Button variant="action" onClick={() => onSelect(offer)} loading={busy} className="w-full sm:w-auto">
              {trade?.selectLabel ?? t("room.selectRate")}
            </Button>
          </div>
        </div>
      </div>

      <Modal open={Boolean(whyOpen)} onClose={() => setWhyOpen(null)} title={whyOpen?.label ?? ""} size="sm">
        <p className="text-sm">{whyOpen?.reason}</p>
      </Modal>
    </li>
  );
}
