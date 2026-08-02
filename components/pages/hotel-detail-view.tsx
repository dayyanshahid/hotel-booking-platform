"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi, useApp } from "@/components/providers/app-provider";
import { SearchBar } from "@/components/search/search-bar";
import { RoomBlock } from "@/components/commerce/rate-card";
import { StaticMap } from "@/components/commerce/static-map";
import { PerRoomNote, PriceBlock } from "@/components/commerce/price";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Photo,
  Rating,
  SectionHeading,
  Skeleton,
  Stars,
  Tabs,
  scoreBand,
} from "@/components/ui";
import { HeartIcon, Icon, amenityIcon } from "@/components/ui/icons";
import { addDays, distanceLabel, formatDate, formatMoney, guestCount, todayIso } from "@/lib/format";
import { guestLabel, nightLabel } from "@/lib/i18n";
import { href, hotelHref } from "@/lib/nav";
import type {
  ApiError,
  CanonicalHotel,
  CanonicalRoom,
  Locale,
  Offer,
  SearchIntent,
} from "@/lib/types";

interface AvailabilityPayload {
  hotel: CanonicalHotel | null;
  rooms: CanonicalRoom[];
  offers: Offer[];
  partial: boolean;
  fetchedAt: string;
}

export function HotelDetailView({
  locale,
  hotel,
  initialIntent,
  similar,
  strings,
}: {
  locale: Locale;
  hotel: CanonicalHotel;
  initialIntent: SearchIntent | null;
  similar: {
    slug: string;
    name: string;
    neighborhood: string;
    category: number;
    image: string;
    imageSrcSet?: string;
    imageFallback?: string;
  }[];
  strings: { heading: string };
}) {
  const { t, currency, track, isSaved, toggleSaved, toast, announce } = useApp();
  const api = useApi();
  const router = useRouter();

  const [intent, setIntent] = useState<SearchIntent>(
    initialIntent ?? {
      destinationId: hotel.destinationId,
      destinationDisplay: hotel.address.city,
      destinationType: "city",
      checkIn: addDays(todayIso(), 21),
      checkOut: addDays(todayIso(), 24),
      flexibility: "exact",
      rooms: [{ adults: 2, childrenAges: [] }],
      locale,
      currency,
    },
  );
  const [availability, setAvailability] = useState<AvailabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [noticeAck, setNoticeAck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api<AvailabilityPayload>(`/api/hotels/${hotel.slug}/availability`, {
      method: "POST",
      body: JSON.stringify({ intent }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAvailability(res.data);
    track("room_list_viewed", {
      hotel: hotel.slug,
      offers: res.data.offers.length,
      rooms: res.data.rooms.length,
    });
    announce(`${res.data.offers.length} ${t("room.rates")}`);
  }, [api, hotel.slug, intent, track, announce, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  /** Notices only show when they intersect the customer's stay (E-23). */
  const activeNotices = useMemo(
    () =>
      hotel.notices.filter(
        (notice) => notice.dateFrom <= intent.checkOut && notice.dateTo >= intent.checkIn,
      ),
    [hotel.notices, intent],
  );

  const offersByRoom = useMemo(() => {
    const map = new Map<string, Offer[]>();
    for (const offer of availability?.offers ?? []) {
      const list = map.get(offer.canonicalRoomId) ?? [];
      list.push(offer);
      map.set(offer.canonicalRoomId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.price.total - b.price.total);
    return map;
  }, [availability]);

  const lowest = availability?.offers.length
    ? availability.offers.reduce((a, b) => (a.price.total <= b.price.total ? a : b))
    : null;

  async function selectOffer(offer: Offer) {
    setSelecting(offer.offerId);
    track("rate_selected", {
      hotel: hotel.slug,
      board: offer.board.code,
      refundable: offer.cancellation.refundable,
      total: offer.price.total,
      recommendation: offer.badges.find((b) => b.kind === "recommendation")?.code ?? null,
    });
    const res = await api<{ checkoutSessionId: string }>("/api/checkout/sessions", {
      method: "POST",
      body: JSON.stringify({ offerId: offer.offerId }),
    });
    setSelecting(null);
    if (!res.ok) {
      toast(res.error.message, "critical");
      void load();
      return;
    }
    router.push(href(locale, `/checkout/${res.data.checkoutSessionId}`));
  }

  const saved = isSaved(hotel.slug);
  const heroImages = hotel.images.filter((i) => !i.roomId);

  return (
    <div className="space-y-6">
      {/* Gallery */}
      <section aria-label={t("hotel.gallery")}>
        {heroImages.length ? (
          <div className="grid gap-2 sm:grid-cols-4 sm:grid-rows-2">
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="aspect-[4/3] sm:col-span-2 sm:row-span-2 sm:aspect-auto"
              aria-label={t("hotel.viewAllPhotos")}
            >
              <Photo
                src={heroImages[0]?.url}
                srcSet={heroImages[0]?.srcSet}
                sizes="(min-width: 1024px) 50vw, 100vw"
                fallbackSrc={heroImages[0]?.fallbackUrl}
                alt={heroImages[0]?.alt ?? hotel.name}
                fill
                priority
                className="rounded-[14px]"
                fallbackLabel={t("hotel.imageFallback")}
              />
            </button>
            {heroImages.slice(1, 5).map((image) => (
              <button key={image.id} type="button" onClick={() => setGalleryOpen(true)} className="hidden sm:block">
                <Photo
                  src={image.url}
                  srcSet={image.srcSet}
                  sizes="(min-width: 1024px) 25vw, 50vw"
                  fallbackSrc={image.fallbackUrl}
                  alt={image.alt}
                  fill
                  className="rounded-[14px]"
                  fallbackLabel={t("hotel.imageFallback")}
                />
              </button>
            ))}
          </div>
        ) : (
          <Alert tone="info">{t("hotel.imageFallback")}</Alert>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted text-xs">{hotel.contentProvenance}</p>
          <Button variant="secondary" size="sm" onClick={() => setGalleryOpen(true)}>
            {t("hotel.viewAllPhotos")} ({hotel.images.length})
          </Button>
        </div>
      </section>

      {/* Summary */}
      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Stars count={hotel.category} label={t("a11y.stars", { n: hotel.category })} />
            <span className="text-muted text-sm">{hotel.propertyType}</span>
            {hotel.chain && <Badge tone="neutral">{hotel.chain}</Badge>}
          </div>
          <h1 className="mt-1 text-[28px] font-bold tracking-[-0.025em] wrap-anywhere sm:text-4xl">{hotel.name}</h1>
          <p className="text-muted mt-1 text-sm wrap-anywhere">
            {hotel.address.line1}, {hotel.address.city}, {hotel.address.country}
          </p>
          {hotel.review && (
            <div className="mt-3">
              <Rating
                score={hotel.review.score}
                scale={hotel.review.scale}
                word={t(scoreBand(hotel.review.score, hotel.review.scale))}
                count={hotel.review.count}
                source={hotel.review.source}
                label={t("a11y.ratingLabel", {
                  score: hotel.review.score,
                  scale: hotel.review.scale,
                  count: hotel.review.count,
                })}
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hotel.amenities.slice(0, 8).map((a) => (
              <Badge key={a.code} tone="neutral" icon={<Icon name={amenityIcon(a.code)} size={13} />}>
                {a.label}
                {a.fee ? ` · ${a.fee}` : ""}
              </Badge>
            ))}
          </div>
        </div>

        <Card className="h-fit p-4 lg:sticky lg:top-24">
          <p className="text-muted text-xs">{t("hotel.fromPrice")}</p>
          {loading && !availability ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : lowest ? (
            <PriceBlock price={lowest.price} size="lg" align="start" />
          ) : (
            <p className="text-muted mt-2 text-sm">{t("hotel.noRooms")}</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <a href="#rooms">
              <Button variant="action" className="w-full">{t("hotel.seeRooms")}</Button>
            </a>
            <Button
              variant="secondary"
              onClick={() =>
                toggleSaved({
                  slug: hotel.slug,
                  name: hotel.name,
                  city: hotel.address.city,
                  image: hotel.images[0]?.url ?? "",
                  total: lowest?.price.total,
                  currency: lowest?.price.currency,
                  checkedAt: new Date().toISOString(),
                  collection: "default",
                })
              }
              aria-pressed={saved}
            >
              <HeartIcon filled={saved} size={17} />
              {saved ? t("results.savedHotel") : t("results.saveHotel")}
            </Button>
          </div>
          <dl className="text-muted mt-4 space-y-1 border-t pt-3 text-xs">
            <div className="flex justify-between gap-2">
              <dt>{t("hotel.checkInOut")}</dt>
              <dd>
                {hotel.policies.checkInFrom} / {hotel.policies.checkOutBy}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("common.dates")}</dt>
              <dd>
                {formatDate(intent.checkIn, locale, { day: "numeric", month: "short" })} →{" "}
                {formatDate(intent.checkOut, locale, { day: "numeric", month: "short" })}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>{t("common.guests")}</dt>
              <dd>
                {intent.rooms.length} × {t("common.room")}, {guestCount(intent.rooms)}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {activeNotices.map((notice) => (
        <Alert
          key={notice.id}
          tone={notice.severity === "critical" ? "critical" : notice.severity === "warning" ? "warning" : "info"}
          title={t("hotel.notice")}
          action={
            notice.severity !== "info" && !noticeAck ? (
              <Button size="sm" variant="secondary" onClick={() => setNoticeAck(true)}>
                {t("hotel.noticeAck")}
              </Button>
            ) : undefined
          }
        >
          <p>{notice.description}</p>
          {notice.alternative && <p className="mt-1">{notice.alternative}</p>}
          <p className="mt-1 text-xs opacity-80">
            {formatDate(notice.dateFrom, locale)} → {formatDate(notice.dateTo, locale)}
          </p>
        </Alert>
      ))}

      <Tabs
        label={hotel.name}
        active={tab}
        onChange={(id) => {
          setTab(id);
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        tabs={[
          { id: "overview", label: t("hotel.overview") },
          { id: "rooms", label: t("hotel.rooms") },
          { id: "amenities", label: t("hotel.amenities") },
          { id: "location", label: t("hotel.location") },
          { id: "policies", label: t("hotel.policies") },
        ]}
      />

      <section id="overview" className="scroll-mt-28">
        <SectionHeading title={t("hotel.overview")} />
        <Card className="p-4">
          <p className="text-sm wrap-anywhere">{hotel.descriptions.overview}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold">{t("hotel.location")}</p>
              <p className="text-muted mt-1 text-sm">{hotel.descriptions.location}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{t("common.child")}</p>
              <p className="text-muted mt-1 text-sm">{hotel.descriptions.family}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{t("room.accessible")}</p>
              <p className="text-muted mt-1 text-sm">{hotel.descriptions.accessibility}</p>
            </div>
          </div>
        </Card>
      </section>

      {/* Rooms */}
      <section id="rooms" className="scroll-mt-28">
        <SectionHeading
          title={strings.heading}
          description={`${t("hotel.roomsFor")} ${intent.rooms.length} × ${t("common.room")}, ${guestCount(intent.rooms)} ${t("common.guests")}`}
        />
        <div className="mb-4">
          <SearchBar variant="compact" initial={intent} onSubmitted={(next) => setIntent(next)} />
        </div>

        {availability?.partial && <Alert tone="warning">{t("results.partial")}</Alert>}

        {loading && (
          <ul className="space-y-4">
            {Array.from({ length: 2 }, (_, i) => (
              <Card key={i} as="li" className="p-4">
                <Skeleton className="h-40 w-full" />
              </Card>
            ))}
          </ul>
        )}

        {error && (
          <Alert
            tone="critical"
            title={t(`error.${error.category}`)}
            correlationId={`${t("error.correlation")}: ${error.correlationId}`}
            action={
              <Button size="sm" onClick={() => load()}>
                {t("common.retry")}
              </Button>
            }
          >
            {error.message}
          </Alert>
        )}

        {!loading && availability && availability.rooms.length === 0 && (
          <EmptyState
            title={t("hotel.noRooms")}
            body={t("hotel.noRoomsBody")}
            actions={
              <Link href={href(locale, "/search")}>
                <Button variant="secondary">{t("hotel.similar")}</Button>
              </Link>
            }
          />
        )}

        {!loading && availability && availability.rooms.length > 0 && (
          <ul className="space-y-4">
            {availability.rooms
              .filter((room) => (offersByRoom.get(room.canonicalRoomId) ?? []).length > 0)
              .map((room) => (
                <RoomBlock
                  key={room.canonicalRoomId}
                  room={room}
                  offers={offersByRoom.get(room.canonicalRoomId) ?? []}
                  onSelect={selectOffer}
                  busyOfferId={selecting}
                />
              ))}
          </ul>
        )}
      </section>

      <section id="amenities" className="scroll-mt-28">
        <SectionHeading title={t("hotel.amenities")} />
        <Card className="p-4">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hotel.amenities.map((amenity) => (
              <li key={amenity.code} className="flex items-start justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Icon name={amenityIcon(amenity.code)} size={16} className="text-brand-600 shrink-0" />
                  {amenity.label}
                </span>
                <span className="text-muted text-xs">
                  {amenity.fee ?? (amenity.included ? t("rate.included") : "")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section id="location" className="scroll-mt-28">
        <SectionHeading title={t("hotel.location")} />
        <Card className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <StaticMap lat={hotel.coordinates.lat} lng={hotel.coordinates.lng} label={hotel.name} />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("hotel.landmarks")}</p>
            <ul className="mt-2 space-y-1.5">
              {hotel.landmarks.map((landmark) => (
                <li key={landmark.label} className="flex justify-between gap-3 text-sm">
                  <span className="wrap-anywhere">{landmark.label}</span>
                  <span className="text-muted whitespace-nowrap">{distanceLabel(landmark.distanceKm, locale)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-3 text-xs">{hotel.descriptions.location}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `${hotel.name}, ${hotel.address.line1}, ${hotel.address.city}, ${hotel.address.country}`,
                );
                toast(t("common.copied"), "success");
              }}
            >
              {t("hotel.addressCopy")}
            </Button>
          </div>
        </Card>
      </section>

      <section id="policies" className="scroll-mt-28">
        <SectionHeading title={t("hotel.policies")} />
        <Accordion
          items={[
            {
              id: "checkin",
              title: t("hotel.checkInOut"),
              defaultOpen: true,
              content: (
                <p>
                  {hotel.policies.checkInFrom} – {hotel.policies.checkInTo} / {hotel.policies.checkOutBy}.{" "}
                  {hotel.policies.idRequirement}
                </p>
              ),
            },
            { id: "children", title: t("common.children"), content: <p>{hotel.policies.childPolicy} {hotel.policies.cotPolicy}</p> },
            { id: "parking", title: t("filters.amenities"), content: <p>{hotel.policies.parking} {hotel.policies.smoking} {hotel.policies.petPolicy}</p> },
            {
              id: "fees",
              title: t("rate.payAtPropertyCharges"),
              content: hotel.policies.localFees.length ? (
                <ul className="space-y-1">
                  {hotel.policies.localFees.map((fee) => (
                    <li key={fee.code}>
                      {fee.label}: {formatMoney(fee.amount, intent.currency, locale)}
                      {fee.estimated ? ` (${t("rate.estimated")})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>—</p>
              ),
            },
            { id: "accessibility", title: t("room.accessible"), content: <p>{hotel.policies.accessibility}</p> },
          ]}
        />
      </section>

      <section>
        <SectionHeading title={t("hotel.similar")} />
        <ul className="grid gap-3 sm:grid-cols-3">
          {similar.map((other) => (
            <li key={other.slug}>
              <Link href={hotelHref(locale, other.slug, intent)}>
                <Card className="hover:surface-sunken h-full overflow-hidden">
                  <Photo
                    src={other.image}
                    srcSet={other.imageSrcSet}
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    fallbackSrc={other.imageFallback}
                    alt={other.name}
                    ratio="16/9"
                    fallbackLabel={t("hotel.imageFallback")}
                  />
                  <div className="p-3">
                    <p className="text-sm font-semibold wrap-anywhere">{other.name}</p>
                    <p className="text-muted text-xs">{other.neighborhood}</p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* F-042 photo viewer */}
      <Modal open={galleryOpen} onClose={() => setGalleryOpen(false)} title={`${hotel.name} — ${t("hotel.gallery")}`} size="lg">
        <ul className="grid gap-3 sm:grid-cols-2">
          {hotel.images.map((image) => (
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
                <Badge tone="neutral">{image.roomId ? t("hotel.roomImagesLabel") : t("hotel.propertyImagesLabel")}</Badge>{" "}
                {image.caption} {image.credit ? `· ${image.credit}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Modal>

      {/* Sticky mobile action */}
      <div className="no-print surface fixed inset-x-0 bottom-14 z-30 flex items-center justify-between gap-3 border-t px-4 py-2 lg:hidden">
        <div className="min-w-0">
          {lowest ? (
            <>
              <p className="truncate text-sm font-bold">
                {formatMoney(lowest.price.total, lowest.price.currency, locale)}
              </p>
              <p className="text-muted truncate text-xs">
                {t("rate.totalFor", {
                  nights: lowest.price.nights,
                  guests: lowest.price.guests,
                  nightUnit: nightLabel(t, lowest.price.nights, locale),
                  guestUnit: guestLabel(t, lowest.price.guests, locale),
                })}
              </p>
              <PerRoomNote price={lowest.price} showEstimate={false} />
            </>
          ) : (
            <p className="text-muted text-xs">{t("common.loading")}</p>
          )}
        </div>
        <a href="#rooms">
          <Button size="sm">{t("hotel.seeRooms")}</Button>
        </a>
      </div>
    </div>
  );
}

/** Coordinate-projected static map with a textual alternative (§5.6). */
