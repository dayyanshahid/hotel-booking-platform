"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card, Modal, Photo, Rating, Stars, cx, scoreBand } from "@/components/ui";
import { HeartIcon, Icon, amenityIcon } from "@/components/ui/icons";
import { PriceBlock } from "./price";
import { distanceLabel, formatDeadline } from "@/lib/format";
import { hotelHref } from "@/lib/nav";
import { SUPPLIER_LABEL, showSupplierSource, supplierOf } from "@/lib/supplier-source";
import type { HotelResultCard, SearchIntent } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * F-031 result card. One canonical card per property regardless of how many
 * internal sources listed it (E-04); total price is primary and the
 * cancellation label sits beside it (§5.4).
 *
 * The trade portal renders the same card. It is the same inventory, ranked the
 * same way, and an agent on the phone is describing the property to a customer
 * who is looking at our public site — a text-only row made them work from a
 * worse picture of our own stock than the caller had. What differs is the
 * money and the actions: the price rail becomes cost, sell and margin, and
 * saving and comparing (which belong to a traveller's own account) come off.
 */
export function HotelCard({
  card,
  intent,
  rank,
  recommendationCriteria,
  href: hrefOverride,
  priceRail,
  actions,
  below,
  density = "comfortable",
}: {
  card: HotelResultCard;
  intent: SearchIntent;
  rank: number;
  recommendationCriteria?: string[];
  /** Where the property opens. Defaults to the consumer property page. */
  href?: string;
  /** Replaces the public price block — the trade rail, when there is one. */
  priceRail?: ReactNode;
  /** Replaces "Show prices", save and compare. */
  actions?: ReactNode;
  /**
   * Opened inside the card, under the row.
   *
   * The trade rate sheet goes here rather than after the card, so the rates
   * belong visibly to the property above them and the row does not become two
   * things with a gap between. A card with this open is still one item in the
   * list, which is what keeps the agent's place while they read it.
   */
  below?: ReactNode;
  /**
   * How much room a row is given.
   *
   * The shop shows a handful of results to somebody choosing a holiday, and the
   * photograph is doing real work there. A counter is a different job: an agent
   * runs a search that returns seventy properties and reads down them against
   * what a caller just said, so a row that stands 530px tall means two and a
   * half on screen and twenty-seven screens of scrolling. `compact` keeps every
   * word and shrinks the space around it.
   */
  density?: "comfortable" | "compact";
}) {
  const { t, locale, isSaved, toggleSaved, compare, toggleCompare, toast, track } = useApp();
  const [whyOpen, setWhyOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const impressed = useRef(false);
  const saved = isSaved(card.slug);
  const tight = density === "compact";

  /** What this rate actually is: the room, the board, and what cancelling costs. */
  const stay = (
    <div className={cx(tight && "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-start")}>
      <p className="text-muted text-xs wrap-anywhere">{card.offerSummary.roomSummary}</p>
      <p className="text-muted text-xs">
        {tight && <span aria-hidden className="me-2">·</span>}
        {card.offerSummary.boardSummary}
      </p>
      {/*
        A badge, not a coloured sentence.

        Whether a rate can be given back is the one fact on this card that
        cannot be undone once it is booked, and it was a line of small red or
        green text in a stack of other small text — the same size and weight as
        the room name above it and the amenities beside it. An agent scanning
        twenty rows for a price does not read a sentence; they see a shape.

        The word carries the meaning and the colour only reinforces it, because
        roughly one man in twelve cannot tell this particular red from this
        particular green.
      */}
      <p
        className={cx(
          "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold wrap-anywhere",
          tight ? "basis-full" : "mt-1",
          card.offerSummary.refundable ? "text-positive-700" : "text-critical-700",
        )}
      >
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold",
            card.offerSummary.refundable
              ? "bg-positive-50 text-positive-700"
              : "bg-critical-50 text-critical-700",
          )}
        >
          <Icon name={card.offerSummary.refundable ? "check" : "alert"} size={12} />
          {card.offerSummary.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
        </span>
        {/* The deadline, which is the half of "free cancellation" that decides
            whether it is any use to the customer in front of the agent. */}
        {card.offerSummary.refundable && card.offerSummary.freeCancellationUntil && (
          <span className="font-medium">
            {t("rate.freeUntil", {
              date: formatDeadline(card.offerSummary.freeCancellationUntil, "UTC", locale),
              tz: locale === "ar" ? "توقيت الفندق" : "hotel local time",
            })}
          </span>
        )}
        {card.remainingLabel && (
          <span className="text-critical-700 ms-2 font-bold">{card.remainingLabel}</span>
        )}
      </p>
    </div>
  );

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
  const href = hrefOverride ?? hotelHref(locale, card.slug, intent);

  return (
    /*
      Three columns: photograph, the property, then the score and the price.
      Everything a shopper compares down a results list — score, total, whether
      it can be cancelled — sits in the right-hand column at the same vertical
      position on every row, so the eye scans one column instead of hunting.
    */
    <Card as="li" className="overflow-hidden p-2" ref={cardRef}>
      {/*
        Container queries, not viewport ones.

        The card was laying out against the window while sitting in a column
        the window knows nothing about. Open the cart and the results column
        drops to about 450px — still "lg" as far as the viewport is concerned,
        so the card kept its two-column desktop grid, and the title, the
        amenities and the price rail rendered on top of each other.

        Measured against its own width, the same card simply stacks when the
        column is narrow and spreads when it is not, whatever else is on screen.
      */}
      <div className={cx("grid", tight ? "gap-2.5 @lg:grid-cols-[minmax(0,168px)_1fr]" : "gap-3 @lg:grid-cols-[minmax(0,240px)_1fr]")}>
        <Link
          href={href}
          className={cx(
            "block aspect-[4/3] overflow-hidden rounded-[6px] sm:aspect-auto sm:h-full",
            tight ? "sm:min-h-[132px]" : "sm:min-h-[190px]",
          )}
          onClick={() => track("hotel_card_clicked", { hotel: card.slug, rank, total: card.price.total, refundable: card.offerSummary.refundable })}
        >
          <Photo
            src={card.heroImage}
            srcSet={card.heroImageSrcSet}
            sizes={tight ? "(min-width: 640px) 168px, 100vw" : "(min-width: 640px) 240px, 100vw"}
            fallbackSrc={card.heroImageFallback}
            alt={card.heroAlt}
            fill
            priority={rank < 3}
            fallbackLabel={t("hotel.imageFallback")}
          />
        </Link>

        {/*
          Two grid children, not four. The title, badges and amenities are one
          column: left as siblings of the price rail they were laid out as
          separate cells, which is what left a void down the middle of the row.
        */}
        <div className={cx("grid items-start pe-1", tight ? "gap-2 py-0.5 @3xl:grid-cols-[1fr_minmax(0,208px)]" : "gap-3 py-1 @3xl:grid-cols-[1fr_minmax(0,210px)]")}>
          <div className={cx("flex flex-col", tight ? "gap-1.5" : "gap-2")}>
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
              <h3 className={cx("text-brand-700 mt-0.5 font-bold tracking-[-0.015em] wrap-anywhere", tight ? "text-[16px] leading-snug" : "text-[18px]")}>
                <Link href={href} className="hover:underline">
                  {card.name}
                </Link>
              </h3>
              <p className="text-muted mt-0.5 text-xs wrap-anywhere">
                {/* A supplier that places a property in a city but not a
                    district leaves this blank; the comma has to go with it. */}
                {card.neighborhood && (
                  <>
                    <span className="text-brand-700 underline">{card.neighborhood}</span>,{" "}
                  </>
                )}
                {card.locality}
                {card.landmarkDistance && (
                  <>
                    {" · "}
                    {distanceLabel(card.landmarkDistance.distanceKm, locale)} {locale === "ar" ? "من" : "from"}{" "}
                    {card.landmarkDistance.label}
                  </>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-1">
              {card.review && (
                <div className="hidden sm:block">
                  <Rating
                    score={card.review.score}
                    scale={card.review.scale}
                    word={t(scoreBand(card.review.score, card.review.scale))}
                    count={card.review.count}
                    source={card.review.source}
                    compact
                    label={t("a11y.ratingLabel", {
                      score: card.review.score,
                      scale: card.review.scale,
                      count: card.review.count,
                    })}
                  />
                </div>
              )}
              {/* A saved list belongs to a traveller's own account, not to a
                  counter working someone else's trip. */}
              <Button
                variant="ghost"
                size="sm"
                hidden={Boolean(actions)}
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
            {/*
              Test phase only, behind NEXT_PUBLIC_SHOW_SUPPLIER=1.

              Which wholesaler this row came from, so the two catalogues can be
              checked against each other during acceptance. The same property
              carried by both suppliers already appears as two rows — they mint
              different slugs and nothing merges them — so this is what tells
              the pair apart. Marked as a test artefact rather than styled to
              belong, because it must not quietly become part of the product.
            */}
            {showSupplierSource() && (
              <Badge tone="critical" title="Test phase — supplier attribution">
                {SUPPLIER_LABEL[supplierOf(card.slug)]}
              </Badge>
            )}
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

          {/*
            Three at a counter, four in the shop.
            The fourth reliably wraps to a second line at trade widths, and a
            row that grows a line for "MasterCard" has spent height on the least
            useful thing the property publishes.
          */}
          <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {(tight ? card.topAmenities.slice(0, 3) : card.topAmenities).map((a) => (
              <span key={a.code} className="inline-flex items-center gap-1">
                <Icon name={amenityIcon(a.code)} size={14} />
                {a.label}
              </span>
            ))}
          </div>

          {/*
            The stay reads down the left; the money reads down the right.

            Room, board and cancellation used to sit in the money rail, right
            aligned — so the row had a ragged left edge, a column of six stacked
            items setting the height, and a void beside it where the detail
            column had already run out. They belong with the property they
            describe, and a reader going down a page of rows gets one edge to
            follow for what the rate *is* and another for what it costs.
          */}
          {tight && <div className="hairline mt-0.5 border-t pt-1.5">{stay}</div>}
          </div>

          <div className={cx("flex flex-col justify-end lg:items-end lg:text-end", tight ? "gap-2" : "gap-3")}>
            <div className="lg:text-end">
              {!tight && stay}

              <div className={tight ? undefined : "mt-2"}>{priceRail ?? <PriceBlock price={card.price} size="sm" />}</div>

              {actions ?? (
                <>
                  {/* The one yellow control on the row. */}
                  <Link href={href} className="mt-2 block">
                    <Button variant="action" size="md" className="w-full">
                      {t("results.showPrices")}
                    </Button>
                  </Link>

                  <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
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
                </>
              )}
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

      {below}
    </Card>
  );
}

export function HotelCardSkeleton() {
  return (
    <Card as="li" className="overflow-hidden">
      <div className="grid @lg:grid-cols-[minmax(0,240px)_1fr]">
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
