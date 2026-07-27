"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card, Modal, Photo, Rating, Stars, cx } from "@/components/ui";
import { HeartIcon, Icon, amenityIcon } from "@/components/ui/icons";
import { PriceBlock } from "./price";
import { distanceLabel, formatDeadline } from "@/lib/format";
import { hotelHref } from "@/lib/nav";
import type { HotelResultCard, SearchIntent } from "@/lib/types";

/**
 * F-031 result card. One canonical card per property regardless of how many
 * internal sources listed it (E-04); total price is primary and the
 * cancellation label sits beside it (§5.4).
 */
export function HotelCard({
  card,
  intent,
  rank,
  recommendationCriteria,
}: {
  card: HotelResultCard;
  intent: SearchIntent;
  rank: number;
  recommendationCriteria?: string[];
}) {
  const { t, locale, isSaved, toggleSaved, compare, toggleCompare, toast, track } = useApp();
  const [whyOpen, setWhyOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const impressed = useRef(false);
  const saved = isSaved(card.slug);

  /** Impression rule (§13.1): counted once, when the card is actually visible. */
  useEffect(() => {
    const node = cardRef.current;
    if (!node || impressed.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !impressed.current) {
            impressed.current = true;
            track("hotel_card_viewed", {
              hotel: card.slug,
              rank,
              total: card.price.total,
              refundable: card.offerSummary.refundable,
              badge: card.badges[0]?.code ?? null,
            });
            observer.disconnect();
          }
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [card, rank, track]);
  const inCompare = compare.includes(card.slug);
  const href = hotelHref(locale, card.slug, intent);

  return (
    <Card as="li" className="card-interactive overflow-hidden" ref={cardRef}>
      <div className="grid sm:grid-cols-[minmax(0,260px)_1fr]">
        <Link
          href={href}
          className="block aspect-[4/3] sm:aspect-auto sm:h-full sm:min-h-[190px]"
          onClick={() => track("hotel_card_clicked", { hotel: card.slug, rank, total: card.price.total, refundable: card.offerSummary.refundable })}
        >
          <Photo
            src={card.heroImage}
            srcSet={card.heroImageSrcSet}
            sizes="(min-width: 640px) 260px, 100vw"
            fallbackSrc={card.heroImageFallback}
            alt={card.heroAlt}
            fill
            priority={rank < 3}
            fallbackLabel={t("hotel.imageFallback")}
          />
        </Link>

        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Stars count={card.category} label={t("a11y.stars", { n: card.category })} />
                <span className="text-muted text-xs">{card.propertyType}</span>
                {card.sourceCount > 1 && (
                  <Badge
                    tone="neutral"
                    title={locale === "ar" ? "دُمجت هذه القائمة من أكثر من مصدر داخلي" : "This listing was merged from more than one internal source"}
                  >
                    {locale === "ar" ? "قائمة موحّدة" : "Merged listing"}
                  </Badge>
                )}
              </div>
              <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.015em] wrap-anywhere">
                <Link href={href} className="hover:underline">
                  {card.name}
                </Link>
              </h3>
              <p className="text-muted text-sm wrap-anywhere">
                {card.neighborhood}, {card.locality}
                {card.landmarkDistance && (
                  <>
                    {" · "}
                    {distanceLabel(card.landmarkDistance.distanceKm, locale)} {locale === "ar" ? "من" : "from"}{" "}
                    {card.landmarkDistance.label}
                  </>
                )}
              </p>
              {card.review && (
                <div className="mt-2">
                  <Rating
                    score={card.review.score}
                    scale={card.review.scale}
                    count={card.review.count}
                    source={card.review.source}
                    label={t("a11y.ratingLabel", {
                      score: card.review.score,
                      scale: card.review.scale,
                      count: card.review.count,
                    })}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={saved}
                aria-label={saved ? t("results.savedHotel") : t("results.saveHotel")}
                onClick={() =>
                  toggleSaved({
                    slug: card.slug,
                    name: card.name,
                    city: card.locality,
                    image: card.heroImage,
                    total: card.price.total,
                    currency: card.price.currency,
                    checkedAt: new Date().toISOString(),
                    collection: "default",
                  })
                }
              >
                <span className={saved ? "text-critical-500" : "text-[var(--text-muted)]"}>
                  <HeartIcon filled={saved} />
                </span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {card.badges.slice(0, 3).map((badge) => (
              <Badge
                key={badge.code}
                tone={badge.kind === "promotional" ? "sand" : badge.kind === "recommendation" ? "brand" : "positive"}
                title={badge.reason}
              >
                {badge.label}
              </Badge>
            ))}
            {card.qualityBadges.map((badge) => (
              <Badge key={badge} tone="neutral">
                {badge === "verifiedQuality"
                  ? locale === "ar" ? "جودة مُتحقق منها" : "Verified quality"
                  : badge === "guestFavourite"
                    ? locale === "ar" ? "مفضل النزلاء" : "Guest favourite"
                    : badge === "businessReady"
                      ? locale === "ar" ? "مناسب للأعمال" : "Business ready"
                      : locale === "ar" ? "عقار جديد" : "New property"}
              </Badge>
            ))}
            {card.accessibilityHighlights.map((h) => (
              <Badge key={h} tone="brand">
                {h}
              </Badge>
            ))}
          </div>

          <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {card.topAmenities.map((a) => (
              <span key={a.code} className="inline-flex items-center gap-1">
                <Icon name={amenityIcon(a.code)} size={14} />
                {a.label}
              </span>
            ))}
          </div>

          <div className="hairline mt-auto flex flex-wrap items-end justify-between gap-3 border-t pt-4">
            <div className="min-w-0 text-sm">
              <p className="font-medium wrap-anywhere">{card.offerSummary.roomSummary}</p>
              <p className="text-muted">{card.offerSummary.boardSummary}</p>
              <p
                className={cx(
                  "mt-1 font-medium wrap-anywhere",
                  card.offerSummary.refundable ? "text-positive-700" : "text-critical-700",
                )}
              >
                {card.offerSummary.refundable
                  ? card.offerSummary.freeCancellationUntil
                    ? t("rate.freeUntil", {
                        date: formatDeadline(card.offerSummary.freeCancellationUntil, "UTC", locale),
                        tz: locale === "ar" ? "توقيت الفندق" : "hotel local time",
                      })
                    : t("rate.refundable")
                  : t("rate.nonRefundable")}
              </p>
              {card.remainingLabel && <p className="text-caution-700 text-xs">{card.remainingLabel}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={inCompare ? "primary" : "secondary"}
                  aria-pressed={inCompare}
                  onClick={() => {
                    const okToAdd = toggleCompare(card.slug);
                    if (!okToAdd) toast(t("results.compareFull"), "critical");
                  }}
                >
                  {t("results.compareAdd")}
                </Button>
                {card.badges.some((b) => b.kind === "recommendation") && recommendationCriteria && (
                  <Button size="sm" variant="quiet" onClick={() => setWhyOpen(true)}>
                    {t("results.whyRecommended")}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <PriceBlock price={card.price} />
              <Link href={href} className="w-full sm:w-auto">
                <Button size="md" className="w-full">
                  {t("common.viewDetails")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Modal open={whyOpen} onClose={() => setWhyOpen(false)} title={t("results.whyRecommended")} size="sm">
        <p className="text-sm">
          {locale === "ar"
            ? "ترتيب «موصى به» يُحسب من معايير منشورة وقابلة للاختبار، وليس من عمولة الموردين:"
            : "The Recommended ranking is computed from published, testable criteria — never from supplier commission:"}
        </p>
        <ul className="mt-3 list-disc space-y-1 ps-5 text-sm">
          {recommendationCriteria?.map((criterion) => <li key={criterion}>{criterion}</li>)}
        </ul>
        <div className="surface-sunken mt-4 rounded-[var(--radius-control)] p-3 text-sm">
          <p className="font-medium">{card.name}</p>
          <ul className="text-muted mt-1 space-y-0.5 text-xs">
            <li>
              {locale === "ar" ? "السعر" : "Price"}: {Math.round(card.scores.price * 100)}%
            </li>
            <li>
              {locale === "ar" ? "الجودة" : "Quality"}: {Math.round(card.scores.quality * 100)}%
            </li>
            <li>
              {locale === "ar" ? "المرونة" : "Flexibility"}: {Math.round(card.scores.flexibility * 100)}%
            </li>
            <li>
              {locale === "ar" ? "ملاءمة الغرفة" : "Room fit"}: {Math.round(card.scores.fit * 100)}%
            </li>
          </ul>
        </div>
      </Modal>
    </Card>
  );
}

export function HotelCardSkeleton() {
  return (
    <Card as="li" className="overflow-hidden">
      <div className="grid sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="surface-sunken shimmer aspect-[4/3]" />
        <div className="space-y-3 p-4">
          <div className="surface-sunken shimmer h-4 w-1/3 rounded" />
          <div className="surface-sunken shimmer h-5 w-2/3 rounded" />
          <div className="surface-sunken shimmer h-3 w-1/2 rounded" />
          <div className="surface-sunken shimmer h-16 w-full rounded" />
        </div>
      </div>
    </Card>
  );
}
