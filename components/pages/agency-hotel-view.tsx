"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi, useApp } from "@/components/providers/app-provider";
import { PortalShell } from "@/components/agency/portal-shell";
import { may, type AgencyContext } from "@/components/agency/use-agency";
import { RateQuantity, TradePrices } from "@/components/agency/ui";
import { QuoteModal } from "@/components/agency/quote-modal";
import { SearchBar } from "@/components/search/search-bar";
import { RoomBlock } from "@/components/commerce/rate-card";
import { PerRoomNote } from "@/components/commerce/price";
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
import { Icon, amenityIcon } from "@/components/ui/icons";
import {
  addDays,
  distanceLabel,
  formatDate,
  formatMoney,
  guestCount,
  isPerRoomTotal,
  todayIso,
} from "@/lib/format";
import { href, searchParamsFromIntent } from "@/lib/nav";
import type { AgencyOfferView } from "@/lib/agency/types";
import type {
  ApiError,
  CanonicalHotel,
  CanonicalRoom,
  CurrencyCode,
  Locale,
  Offer,
  SearchIntent,
} from "@/lib/types";

/**
 * A property, as an agent needs to see it before selling it.
 *
 * The same page the public site shows — gallery, overview, every room with
 * every rate and its conditions, amenities, location, policies — because the
 * agent is describing this property to someone who is looking at that page. A
 * trade screen that showed less meant the caller could ask a question the
 * person selling to them could not answer.
 *
 * What differs is the money and what you can do with it: each rate carries the
 * agency's cost, sell and margin against the struck public price, and goes
 * into a quote or straight onto the credit line rather than into a checkout.
 */
export function AgencyHotelView({
  locale,
  hotel,
  initialIntent,
  similar,
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
}) {
  return (
    <PortalShell locale={locale}>
      {(context) => (
        <HotelDetail
          locale={locale}
          hotel={hotel}
          initialIntent={initialIntent}
          similar={similar}
          context={context}
        />
      )}
    </PortalShell>
  );
}

interface AvailabilityPayload {
  hotel: CanonicalHotel | null;
  rooms: CanonicalRoom[];
  offers: Offer[];
  partial: boolean;
  fetchedAt: string;
}

function HotelDetail({
  locale,
  hotel,
  initialIntent,
  similar,
  context,
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
  context: AgencyContext;
}) {
  const { t, toast } = useApp();
  const api = useApi();
  const router = useRouter();

  /*
   * A bare link used to be a dead end: no dates in the URL meant "property
   * gone". It was never gone — nobody had said when. It now opens on a stay
   * three weeks out, exactly as the public page does, with the bar right there
   * to correct it.
   */
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
      currency: context.agency.credit.currency as SearchIntent["currency"],
    },
  );
  const [availability, setAvailability] = useState<AvailabilityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [tab, setTab] = useState("overview");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [noticeAck, setNoticeAck] = useState(false);

  /** Rates set aside for a quote, in the order the agent picked them. */
  const [basket, setBasket] = useState<string[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  /**
   * The cheapest rate, priced for the rail and the phone bar. Every other rate
   * is priced by the room block that shows it.
   */
  const [quotes, setQuotes] = useState<Record<string, AgencyOfferView>>({});

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

    /*
     * Only the cheapest rate is quoted here, for the rail and the phone bar.
     * Every other rate is quoted by the room block that shows it, so pricing
     * the whole page again from here would be the same work done twice.
     */
    const cheapest = res.data.offers.reduce<Offer | null>(
      (best, offer) => (!best || offer.price.total < best.price.total ? offer : best),
      null,
    );
    if (!cheapest) return;
    const priced = await api<{ quotes: AgencyOfferView[] }>("/api/agency/quote", {
      method: "POST",
      body: JSON.stringify({ offerIds: [cheapest.offerId] }),
    });
    if (priced.ok) setQuotes(Object.fromEntries(priced.data.quotes.map((q) => [q.offerId, q])));
  }, [api, hotel.slug, intent]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  /** Notices only show when they intersect the stay being sold (E-23). */
  const activeNotices = useMemo(
    () => hotel.notices.filter((notice) => notice.dateFrom <= intent.checkOut && notice.dateTo >= intent.checkIn),
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
  const lowestQuote = lowest ? quotes[lowest.offerId] : undefined;

  const heroImages = hotel.images.filter((i) => !i.roomId);
  const searchBack = `${href(locale, "/agency/search")}?${searchParamsFromIntent(intent).toString()}`;

  /**
   * A rate can fill more than one room, so the basket counts rather than toggles.
   *
   * Three rooms at the same rate is the ordinary group booking and it was the one
   * thing the basket could not express: picking a rate a second time removed it.
   * An agent had to find three *different* rates to book three rooms, which is
   * not what they wanted and not what the party needed.
   */
  const roomsWanted = Math.max(1, intent.rooms.length);

  function addToBasket(offerId: string) {
    // Never past the party. The checkout refuses more rooms than the search
    // asked for, so a stepper that went further would only teach the agent that
    // the button lies.
    setBasket((prev) => (prev.length >= roomsWanted ? prev : [...prev, offerId]));
  }

  function removeFromBasket(offerId: string) {
    setBasket((prev) => {
      const at = prev.lastIndexOf(offerId);
      return at === -1 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
    });
  }

  /** The one-click common case: this rate, for every room the search asked for. */
  function fillBasketWith(offerId: string) {
    setBasket(Array.from({ length: roomsWanted }, () => offerId));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={searchBack} className="text-muted text-sm underline">
          ← {t("agency.backToResults")}
        </Link>
        {/*
          One basket, two outcomes — and this page is where the group case
          actually happens. Every rate here belongs to this property, so a set
          picked on this screen is always bookable as one order; the search page
          has to check, because a basket there can span hotels.
        */}
        {basket.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setQuoteOpen(true)}>
              {t("agency.newQuote")} ({basket.length})
            </Button>
            {may(context, "issue") && (
              <Button
                size="sm"
                onClick={() =>
                  router.push(href(locale, `/agency/book/${basket.map(encodeURIComponent).join(",")}`))
                }
              >
                {t("agency.bookRooms", { rooms: basket.length })}
              </Button>
            )}
          </div>
        )}
      </div>

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

        {/*
          The rail a traveller sees carries one number. This one carries the
          three that decide whether the sale happens: what the customer would
          pay online, what the agency would charge, and what it keeps.
        */}
        <Card className="h-fit p-4 lg:sticky lg:top-4">
          <p className="text-muted text-xs">{t("hotel.fromPrice")}</p>
          {loading && !availability ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : lowestQuote && lowest ? (
            <div className="mt-1">
              <TradePrices
                cost={lowestQuote.cost}
                sell={lowestQuote.sell}
                margin={lowestQuote.margin}
                currency={lowestQuote.currency}
                locale={locale}
                publicPrice={lowest.price.total}
                perRoomOf={isPerRoomTotal(lowest.price) ? lowest.price.roomsRequested : undefined}
              />
            </div>
          ) : lowest ? (
            <div className="mt-2">
              <p className="text-lg font-bold">
                {formatMoney(lowest.price.total, lowest.price.currency as CurrencyCode, locale)}
              </p>
              <PerRoomNote price={lowest.price} />
            </div>
          ) : (
            <p className="text-muted mt-2 text-sm">{t("hotel.noRooms")}</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <a href="#rooms">
              <Button variant="action" className="w-full">
                {t("hotel.seeRooms")}
              </Button>
            </a>
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
            {context.balance && (
              <div className="flex justify-between gap-2">
                <dt>{t("agency.creditAvailable")}</dt>
                <dd>
                  {formatMoney(context.balance.available, context.agency.credit.currency as CurrencyCode, locale)}
                </dd>
              </div>
            )}
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
          title={t("agency.allRates")}
          description={`${t("hotel.roomsFor")} ${intent.rooms.length} × ${t("common.room")}, ${guestCount(intent.rooms)} ${t("common.guests")}`}
        />
        {/*
          The stay is editable here, not only back on the results page. A
          customer asking "what about the week after?" used to send the agent
          back to search and start again; now it is one control away, and the
          rates below re-price against it.
        */}
        <Card className="mb-4 p-3">
          <SearchBar
            key={searchParamsFromIntent(intent).toString()}
            variant="panel"
            initial={intent}
            currency={intent.currency}
            busy={loading}
            onSearch={(next) => setIntent(next)}
          />
        </Card>

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
            title={t("agency.noRates")}
            body={t("agency.noRatesBody")}
            actions={
              <Link href={searchBack}>
                <Button variant="secondary">{t("agency.backToResults")}</Button>
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
                  // Booking on account, not a card checkout: the rate is
                  // re-checked and the credit line committed on the next screen.
                  onSelect={(offer) => router.push(href(locale, `/agency/book/${offer.offerId}`))}
                  trade={{
                    selectLabel: t("agency.book"),
                    price: (offer, quote) =>
                      quote ? (
                        <TradePrices
                          cost={quote.cost}
                          sell={quote.sell}
                          margin={quote.margin}
                          currency={quote.currency}
                          locale={locale}
                          publicPrice={offer.price.total}
                          perRoomOf={isPerRoomTotal(offer.price) ? offer.price.roomsRequested : undefined}
                        />
                      ) : (
                        // The rate is real; the agency's cost is a second call.
                        // Showing the public price as if it were theirs would be
                        // worse than showing nothing yet.
                        <div className="space-y-1.5 text-end">
                          <div className="surface-sunken shimmer ms-auto h-3 w-24 rounded" />
                          <div className="surface-sunken shimmer ms-auto h-6 w-28 rounded" />
                          <div className="surface-sunken shimmer ms-auto h-3 w-36 rounded" />
                        </div>
                      ),
                    secondary: (offer) => (
                      <RateQuantity
                        count={basket.filter((id) => id === offer.offerId).length}
                        roomsWanted={roomsWanted}
                        roomsHeld={basket.length}
                        onAdd={() => addToBasket(offer.offerId)}
                        onRemove={() => removeFromBasket(offer.offerId)}
                        onFillAll={() => fillBasketWith(offer.offerId)}
                      />
                    ),
                  }}
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
                <span className="text-muted text-xs">{amenity.fee ?? (amenity.included ? t("rate.included") : "")}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section id="location" className="scroll-mt-28">
        <SectionHeading title={t("hotel.location")} />
        <Card className="grid gap-4 p-4 lg:grid-cols-2">
          <StaticMap lat={hotel.coordinates.lat} lng={hotel.coordinates.lng} label={hotel.name} />
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
            {
              id: "children",
              title: t("common.children"),
              content: (
                <p>
                  {hotel.policies.childPolicy} {hotel.policies.cotPolicy}
                </p>
              ),
            },
            {
              id: "parking",
              title: t("filters.amenities"),
              content: (
                <p>
                  {hotel.policies.parking} {hotel.policies.smoking} {hotel.policies.petPolicy}
                </p>
              ),
            },
            {
              id: "fees",
              // The agent is the one who will be asked about these at the desk,
              // so they are not buried any deeper here than on the public page.
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

      {similar.length > 0 && (
        <section>
          <SectionHeading title={t("hotel.similar")} />
          <ul className="grid gap-3 sm:grid-cols-3">
            {similar.map((other) => (
              <li key={other.slug}>
                <Link
                  href={`${href(locale, `/agency/hotel/${other.slug}`)}?${searchParamsFromIntent(intent).toString()}`}
                >
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
      )}

      <Modal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        title={`${hotel.name} — ${t("hotel.gallery")}`}
        size="lg"
      >
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
                <Badge tone="neutral">
                  {image.roomId ? t("hotel.roomImagesLabel") : t("hotel.propertyImagesLabel")}
                </Badge>{" "}
                {image.caption} {image.credit ? `· ${image.credit}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Modal>

      <QuoteModal
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        offerIds={basket}
        onCreated={(id) => {
          setBasket([]);
          router.push(href(locale, `/agency/quotes/${id}`));
        }}
      />

      {/* Sticky action on a phone, showing what the agency would charge. */}
      <div className="no-print surface fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t px-4 py-2 lg:hidden">
        <div className="min-w-0">
          {lowestQuote ? (
            <>
              <p className="truncate text-sm font-bold">
                {formatMoney(lowestQuote.sell, lowestQuote.currency as CurrencyCode, locale)}
              </p>
              <p className="text-muted truncate text-xs">
                {t("agency.margin")} {formatMoney(lowestQuote.margin, lowestQuote.currency as CurrencyCode, locale)}
              </p>
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
function StaticMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <div
      className="surface-sunken hairline relative overflow-hidden rounded-[var(--radius-card)] border"
      style={{ aspectRatio: "4/3" }}
    >
      <svg viewBox="0 0 400 300" className="size-full" role="img" aria-label={label}>
        <defs>
          <pattern id="agency-minimap" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--border)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="var(--surface)" />
        <rect width="400" height="300" fill="url(#agency-minimap)" />
        <circle cx="200" cy="150" r="12" fill="var(--color-brand-600, #14676d)" opacity="0.25" />
        <circle cx="200" cy="150" r="6" fill="var(--color-brand-600, #14676d)" />
        <text x="200" y="180" textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </text>
      </svg>
    </div>
  );
}
