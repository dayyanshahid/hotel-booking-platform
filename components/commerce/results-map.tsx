"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card, Photo, cx } from "@/components/ui";
import { PerRoomNote } from "./price";
import { apiUrl } from "@/lib/api-origin";
import { comparableTotal, formatMoney, isPerRoomTotal } from "@/lib/format";
import { hotelHref } from "@/lib/nav";
import {
  TILE_SIZE,
  clusterByDistance,
  fromScreen,
  metresPerPixel,
  toScreen,
  viewport,
  viewportTiles,
  zoomToFit,
} from "@/lib/geo/tiles";
import type { HotelResultCard, SearchFilters, SearchIntent } from "@/lib/types";

/**
 * F-032 — list/map with synchronised selection, price markers, clustering and
 * "search this area".
 *
 * There is now a map under the pins. This drew graph paper, on the reasoning
 * that a tile SDK is a large dependency and the keyboard list beside it is the
 * accessible path either way — both true, and neither an argument for a
 * picture that cannot answer the question the map exists for. Two pins forty
 * pixels apart told an agent their order and nothing about whether either was
 * near the customer's meeting.
 *
 * It is real tiles and no SDK: the projection is `lib/geo/tiles`, the tiles are
 * `<img>` elements our own route proxies, and pan and zoom are arithmetic on a
 * centre and an integer zoom. The pins were laid out by stretching latitude and
 * longitude linearly across a box, which is not what a map does — they are on
 * Web Mercator now, the same projection as the ground they sit on, so a pin is
 * over its building rather than near it.
 */
export function ResultsMap({
  cards,
  intent,
  selected,
  onSelect,
  onSearchArea,
  hrefFor,
  priceFor,
}: {
  cards: HotelResultCard[];
  intent: SearchIntent;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  onSearchArea: (bounds: NonNullable<SearchFilters["bounds"]>) => void;
  /** Where a pin opens. The trade portal keeps agents inside the portal. */
  hrefFor?: (slug: string) => string;
  /**
   * What the callout says about money.
   *
   * The map is the same component on both sides of the platform, and the one
   * thing that must not be the same is the price: the public total in a trade
   * callout is the number an agent must never quote. The list beside the map
   * already carries cost, sell and margin, so a bubble showing the public price
   * put two different figures for one room on one screen. Given nothing, it
   * keeps the public price, which is right for a traveller.
   */
  priceFor?: (card: HotelResultCard) => ReactNode;
}) {
  const { t, locale, track } = useApp();

  const frameRef = useRef<HTMLDivElement>(null);
  /** Measured, because which tiles are needed depends on how big the box is. */
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [centre, setCentre] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const dragRef = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);

  useLayoutEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const measure = (width: number, height: number) => {
      setSize((previous) => {
        const next = { width: Math.round(width), height: Math.round(height) };
        // Re-fitting the map is not free, and a sub-pixel reflow is not a resize.
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });
    };

    /*
     * Measured once here, before the observer.
     *
     * A ResizeObserver callback is only delivered during the rendering steps,
     * so a frame that is laid out but not yet painted — a tab opened in the
     * background, a pane the compositor has not reached — reports nothing, and
     * a map that waits for the callback stays empty indefinitely. The box has
     * a size the moment layout runs, so take it.
     */
    const box = node.getBoundingClientRect();
    measure(box.width, box.height);

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      measure(rect.width, rect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /*
   * Open on the results, and re-fit when a new search replaces them.
   *
   * Keyed on the properties rather than on every render: a pan must not be
   * undone by the next paint, but searching a different city should not leave
   * the map over the old one.
   */
  const fitKey = useMemo(() => cards.map((card) => card.slug).join("|"), [cards]);
  useEffect(() => {
    if (!size.width || !size.height || !cards.length) return;
    setCentre(
      zoomToFit(
        cards.map((card) => card.coordinates),
        size.width,
        size.height,
      ),
    );
    setMissing(new Set());
  }, [fitKey, size.width, size.height]);

  const view = useMemo(
    () =>
      centre && size.width
        ? viewport(centre.lat, centre.lng, centre.zoom, size.width, size.height)
        : null,
    [centre, size.width, size.height],
  );

  /*
   * A map is a comparison, so every pin has to carry the same kind of number.
   *
   * On a multi-room search some sources price the whole party and some price one
   * room, so the raw totals put a $65 single room beside a $227 three-room stay
   * as though the first were cheaper — the ranking bug, drawn to scale. When any
   * pin is a per-room figure they all become per-room, and one caption above the
   * map says so rather than a label on every pin.
   */
  const perRoomPins = cards.some((card) => isPerRoomTotal(card.price));
  const pinAmount = (card: HotelResultCard) =>
    perRoomPins ? Math.round(comparableTotal(card.price)) : card.price.total;

  /**
   * Clustering in screen pixels, so it thins out as the map zooms in.
   *
   * Greedy by distance rather than by grid cell. A grid puts each pin in a
   * bucket and calls neighbouring buckets separate, but two pins either side
   * of a cell boundary can be one pixel apart — in central Dubai that drew a
   * price pill directly over the one behind it, and the covered rate could not
   * be read or clicked. Claiming a radius around each pin as it is placed is
   * the only version of this that actually guarantees the labels are legible.
   *
   * Cheapest first, so the pin that survives a crowd is the one an agent is
   * looking for; the rest fold into its count rather than disappearing.
   */
  const clusters = useMemo(() => {
    if (!view) return [];

    // Roughly a price pill plus its gap: wide, because the labels are wide and
    // it is their boxes that collide, not their centres.
    const separation = 104;

    return clusterByDistance(
      cards
        .map((card) => ({ card, ...toScreen(view, card.coordinates.lat, card.coordinates.lng) }))
        .sort((a, b) => pinAmount(a.card) - pinAmount(b.card)),
      separation,
    );
    // `pinAmount` is derived from `cards` and changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, view]);

  const selectedCard = cards.find((card) => card.slug === selected) ?? null;

  const scale = useMemo(() => {
    if (!view || !centre) return null;
    const perPixel = metresPerPixel(centre.lat, centre.zoom);
    const target = perPixel * 110;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 5, 10].find((s) => s * magnitude >= target) ?? 10;
    const metres = step * magnitude;
    return {
      widthPx: metres / perPixel,
      label: metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`,
    };
  }, [view, centre]);

  /** The viewport's own corners, read back as somewhere to search. */
  function visibleBounds() {
    if (!view) return { north: 1, south: 0, east: 1, west: 0 };
    const topLeft = fromScreen(view, 0, 0);
    const bottomRight = fromScreen(view, view.width, view.height);
    return {
      north: topLeft.lat,
      south: bottomRight.lat,
      west: topLeft.lng,
      east: bottomRight.lng,
    };
  }

  function nudgeZoom(by: number) {
    setCentre((prev) => (prev ? { ...prev, zoom: Math.min(18, Math.max(2, prev.zoom + by)) } : prev));
    setMissing(new Set());
  }

  const tiles = view ? viewportTiles(view) : [];

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border">
      <div
        ref={frameRef}
        className="surface-sunken relative h-[420px] w-full touch-none select-none overflow-hidden lg:h-[620px]"
        onPointerDown={(e) => {
          if (!centre) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragRef.current = { x: e.clientX, y: e.clientY, lat: centre.lat, lng: centre.lng };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || !view) return;
          /*
           * Dragging moves the ground, so the centre moves the other way — and
           * it is converted through the projection rather than by adding
           * degrees, because a pixel is not a fixed number of degrees at any
           * latitude but the equator.
           */
          const from = viewport(drag.lat, drag.lng, view.zoom, view.width, view.height);
          const next = fromScreen(
            from,
            view.width / 2 - (e.clientX - drag.x),
            view.height / 2 - (e.clientY - drag.y),
          );
          setCentre((prev) => (prev ? { ...prev, lat: next.lat, lng: next.lng } : prev));
        }}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
        role="img"
        aria-label={t("a11y.mapListAlternative")}
      >
        {/* The old graph paper, kept as what a tile outage looks like. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px)," +
              "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.5,
          }}
        />

        {tiles.map((tile) => {
          const key = `${tile.z}/${tile.x}/${tile.y}`;
          if (missing.has(key)) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={key}
              src={apiUrl(`/api/map/tile/${tile.z}/${tile.x}/${tile.y}`)}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              draggable={false}
              decoding="async"
              onError={() => setMissing((prev) => new Set(prev).add(key))}
              className="pointer-events-none absolute max-w-none"
              style={{ left: tile.left, top: tile.top }}
            />
          );
        })}

        {clusters.map((group, i) => {
          const isCluster = group.length > 1;
          const active = group.some((entry) => entry.card.slug === selected);
          /*
           * The anchor, not merely the cheapest.
           *
           * Clustering claimed a radius around this exact point, so drawing the
           * pill anywhere else — a centroid, a re-derived minimum — puts it
           * back inside a neighbour's clearance and the labels overlap again.
           * The groups are built cheapest-first, so the anchor is also the
           * lowest rate, which is the number worth showing.
           */
          const cheapest = group[0];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(cheapest.card.slug)}
              style={{ left: cheapest.x, top: cheapest.y }}
              className={cx(
                "tabular absolute min-h-8 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap",
                "rounded-[var(--radius-pill)] border px-3 text-xs font-semibold",
                "shadow-[var(--shadow-card)] transition-[background-color,border-color,color,transform]",
                "duration-150 ease-[var(--ease-out)] hover:z-10 hover:scale-105",
                active ? "bg-brand-600 border-brand-600 z-10 text-white" : "surface",
              )}
            >
              {isCluster ? `${group.length} · ` : ""}
              {formatMoney(pinAmount(cheapest.card), cheapest.card.price.currency, locale)}
            </button>
          );
        })}

        <div className="absolute top-3 end-3 flex flex-col gap-1">
          <Button size="sm" variant="secondary" onClick={() => nudgeZoom(1)} aria-label={t("common.zoomIn")}>
            +
          </Button>
          <Button size="sm" variant="secondary" onClick={() => nudgeZoom(-1)} aria-label={t("common.zoomOut")}>
            −
          </Button>
        </div>

        <div className="absolute top-3 start-3 flex flex-col items-start gap-2">
          <Button
            size="sm"
            onClick={() => {
              track("map_area_searched", { count: cards.length });
              onSearchArea(visibleBounds());
            }}
          >
            {t("results.searchArea")}
          </Button>
          {/* Said once for the whole map rather than crowded onto every pin. */}
          {perRoomPins && (
            <span className="surface hairline text-caution-700 rounded-[var(--radius-pill)] border px-2.5 py-1 text-xs font-medium">
              {t("rate.perRoom")}
            </span>
          )}
        </div>

        {scale && (
          <div className="pointer-events-none absolute bottom-3 end-3 flex flex-col items-end gap-1">
            <span className="surface/90 rounded px-1 text-[11px] font-medium backdrop-blur-[2px]">
              {scale.label}
            </span>
            <span
              className="border-[var(--text)] border-b-2 border-s-2 border-e-2"
              style={{ width: Math.round(scale.widthPx), height: 6 }}
            />
          </div>
        )}

        {/* Required by the licence, not decoration. */}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer noopener"
          className="surface/90 absolute bottom-0 end-0 px-1 text-[10px] leading-4 backdrop-blur-[2px] hover:underline"
        >
          {t("hotel.mapCredit")}
        </a>

        {selectedCard && (
          <div className="absolute inset-x-3 bottom-8 lg:max-w-sm">
            <Card className="flex gap-3 overflow-hidden p-2">
              <Photo
                src={selectedCard.heroImage}
                srcSet={selectedCard.heroImageSrcSet}
                sizes="96px"
                fallbackSrc={selectedCard.heroImageFallback}
                alt={selectedCard.heroAlt}
                ratio="1/1"
                className="w-24 shrink-0 rounded-[var(--radius-control)]"
                fallbackLabel={t("hotel.imageFallback")}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{selectedCard.name}</p>
                <p className="text-muted truncate text-xs">{selectedCard.neighborhood}</p>
                {priceFor ? (
                  <div className="mt-1">{priceFor(selectedCard)}</div>
                ) : (
                  <>
                    <p className="tabular mt-1 text-sm font-bold">
                      {formatMoney(selectedCard.price.total, selectedCard.price.currency, locale)}
                    </p>
                    {/* The callout has room for the whole caveat, so it carries
                        it rather than the bare per-room figure the pin shows. */}
                    <PerRoomNote price={selectedCard.price} />
                  </>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={selectedCard.offerSummary.refundable ? "positive" : "critical"}>
                    {selectedCard.offerSummary.refundable ? t("rate.refundable") : t("rate.nonRefundable")}
                  </Badge>
                  <Link href={hrefFor?.(selectedCard.slug) ?? hotelHref(locale, selectedCard.slug, intent)}>
                    <Button size="sm">{t("common.viewDetails")}</Button>
                  </Link>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onSelect(null)} aria-label={t("common.close")}>
                ✕
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Keyboard-accessible alternative to the map (§5.4). */}
      <details className="surface border-t p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">{t("a11y.mapListAlternative")}</summary>
        <ul className="mt-2 space-y-1">
          {cards.map((card) => (
            <li key={card.slug}>
              <button
                type="button"
                onClick={() => onSelect(card.slug)}
                className={cx(
                  "hover:surface-sunken flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 text-start text-sm",
                  selected === card.slug && "surface-sunken",
                )}
              >
                <span className="truncate">
                  {card.name} — {card.neighborhood}
                </span>
                <span className="font-semibold">{formatMoney(pinAmount(card), card.price.currency, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
