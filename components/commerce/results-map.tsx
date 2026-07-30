"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { Badge, Button, Card, Photo, cx } from "@/components/ui";
import { PerRoomNote } from "./price";
import { comparableTotal, formatMoney, isPerRoomTotal } from "@/lib/format";
import { hotelHref } from "@/lib/nav";
import type { HotelResultCard, SearchFilters, SearchIntent } from "@/lib/types";

/**
 * F-032 — list/map with synchronized selection, price markers, clustering and
 * "search this area".
 *
 * The map is rendered from projected coordinates rather than a third-party tile
 * SDK: it keeps the route bundle small (§12.2) and guarantees the keyboard-
 * accessible list alternative required by §5.4 is always present.
 */
export function ResultsMap({
  cards,
  intent,
  selected,
  onSelect,
  onSearchArea,
  hrefFor,
}: {
  cards: HotelResultCard[];
  intent: SearchIntent;
  selected: string | null;
  onSelect: (slug: string | null) => void;
  onSearchArea: (bounds: NonNullable<SearchFilters["bounds"]>) => void;
  /** Where a pin opens. The trade portal keeps agents inside the portal. */
  hrefFor?: (slug: string) => string;
}) {
  const { t, locale, track } = useApp();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const bounds = useMemo(() => {
    if (!cards.length) return { north: 1, south: 0, east: 1, west: 0 };
    const lats = cards.map((c) => c.coordinates.lat);
    const lngs = cards.map((c) => c.coordinates.lng);
    const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.15 + 0.01;
    const padLng = (Math.max(...lngs) - Math.min(...lngs)) * 0.15 + 0.01;
    return {
      north: Math.max(...lats) + padLat,
      south: Math.min(...lats) - padLat,
      east: Math.max(...lngs) + padLng,
      west: Math.min(...lngs) - padLng,
    };
  }, [cards]);

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

  const W = 800;
  const H = 560;

  function project(lat: number, lng: number) {
    const x = ((lng - bounds.west) / (bounds.east - bounds.west)) * W;
    const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * H;
    return { x, y };
  }

  // Simple grid clustering so dense areas stay readable at low zoom.
  const clusters = useMemo(() => {
    const cell = 70 / zoom;
    const map = new Map<string, HotelResultCard[]>();
    for (const card of cards) {
      const { x, y } = project(card.coordinates.lat, card.coordinates.lng);
      const key = `${Math.round(x / cell)}:${Math.round(y / cell)}`;
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, zoom, bounds]);

  const selectedCard = cards.find((c) => c.slug === selected) ?? null;

  const visibleBounds = () => {
    // Convert the current pan/zoom viewport back into geographic bounds.
    const spanLat = (bounds.north - bounds.south) / zoom;
    const spanLng = (bounds.east - bounds.west) / zoom;
    const centreLat = bounds.north - ((H / 2 - pan.y) / H) * (bounds.north - bounds.south);
    const centreLng = bounds.west + ((W / 2 - pan.x) / W) * (bounds.east - bounds.west);
    return {
      north: centreLat + spanLat / 2,
      south: centreLat - spanLat / 2,
      east: centreLng + spanLng / 2,
      west: centreLng - spanLng / 2,
    };
  };

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border">
      <div
        className="surface-sunken relative"
        onMouseDown={(e) => (dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y })}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[420px] w-full touch-none lg:h-[620px]"
          role="img"
          aria-label={t("a11y.mapListAlternative")}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="1" />
            </pattern>
          </defs>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`} style={{ transformOrigin: "center" }}>
            <rect width={W} height={H} fill="var(--surface)" />
            <rect width={W} height={H} fill="url(#grid)" />
            {clusters.map((group, i) => {
              const first = group[0];
              const { x, y } = project(first.coordinates.lat, first.coordinates.lng);
              const isCluster = group.length > 1;
              const active = group.some((c) => c.slug === selected);
              const cheapest = group.reduce((a, b) => (pinAmount(a) <= pinAmount(b) ? a : b));
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <foreignObject x={-46} y={-18} width={110} height={40} style={{ overflow: "visible" }}>
                    <button
                      type="button"
                      onClick={() => onSelect(isCluster ? cheapest.slug : first.slug)}
                      className={cx(
                        "tabular min-h-8 whitespace-nowrap rounded-[var(--radius-pill)] border px-3 text-xs font-semibold",
                        "shadow-[var(--shadow-card)] transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] hover:scale-105",
                        active ? "bg-brand-600 border-brand-600 text-white" : "surface",
                      )}
                    >
                      {isCluster ? `${group.length} · ` : ""}
                      {formatMoney(pinAmount(cheapest), cheapest.price.currency, locale)}
                    </button>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute top-3 end-3 flex flex-col gap-1">
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.min(4, z + 0.4))} aria-label="Zoom in">
            +
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setZoom((z) => Math.max(1, z - 0.4))} aria-label="Zoom out">
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

        {selectedCard && (
          <div className="absolute inset-x-3 bottom-3 lg:max-w-sm">
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
                <p className="tabular mt-1 text-sm font-bold">
                  {formatMoney(selectedCard.price.total, selectedCard.price.currency, locale)}
                </p>
                {/* The callout has room for the whole caveat, so it carries it
                    rather than the bare per-room figure the pin shows. */}
                <PerRoomNote price={selectedCard.price} />
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
