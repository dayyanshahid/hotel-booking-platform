"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/app-provider";
import { cx } from "@/components/ui";
import { apiUrl } from "@/lib/api-origin";
import { TILE_SIZE, metresPerPixel, tileGrid } from "@/lib/geo/tiles";

/**
 * Where the property actually is.
 *
 * This was a grid of graph paper with a dot on it and the coordinates printed
 * underneath, which is a decorative way of saying nothing: an agent asked "is
 * it near the airport?" could read 25.2505, 55.2988 aloud and be no further
 * forward. The nearby list beside it carried the whole answer, and the picture
 * carried none of it.
 *
 * It is real tiles now — streets, water, the shape of the city — assembled as
 * a grid of plain images. No mapping library: a slippy map is a projection and
 * some `<img>` tags, and the projection is thirty lines in `lib/geo/tiles`.
 * That keeps the route bundle exactly as small as the fake one did, which was
 * the only good argument the fake one ever had.
 *
 * Deliberately not interactive. This is an inset that answers "whereabouts",
 * and pan and zoom on a card that size mostly means getting lost and finding
 * the back button. The results map is the one that pans.
 */
export function StaticMap({
  lat,
  lng,
  label,
  zoom = 15,
  className,
}: {
  lat: number;
  lng: number;
  label: string;
  zoom?: number;
  className?: string;
}) {
  const { t, locale } = useApp();
  /** Tiles that refused to load, so their gap can be left to the grid beneath. */
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const grid = useMemo(() => tileGrid(lat, lng, zoom, 3, 3), [lat, lng, zoom]);

  /*
   * A scale bar, snapped to something round.
   *
   * Metres per pixel shrinks towards the poles, so this is computed from the
   * property's own latitude rather than from a constant that would be wrong
   * everywhere except the equator.
   */
  const scale = useMemo(() => {
    const perPixel = metresPerPixel(lat, zoom);
    const target = perPixel * 90;
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const step = [1, 2, 5, 10].find((s) => s * magnitude >= target) ?? 10;
    const metres = step * magnitude;
    return {
      widthPx: metres / perPixel,
      label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`,
    };
  }, [lat, zoom]);

  const usable = grid.tiles.filter((tile) => !missing.has(`${tile.z}/${tile.x}/${tile.y}`));
  const blank = usable.length === 0;

  return (
    <figure className={cx("m-0", className)}>
      <div
        className="surface-sunken relative overflow-hidden rounded-[var(--radius-card)] border"
        style={{ aspectRatio: "4 / 3" }}
        role="img"
        aria-label={t("hotel.mapOf", { name: label })}
      >
        {/*
          The graph paper stays, underneath. It is what a tile host outage
          looks like now — a gap in a map rather than a broken image icon —
          and it is what fills the corners at the poles where tiles do not
          exist at all.
        */}
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

        {/*
          The grid is translated so the property sits in the middle of the
          frame whatever fraction of its own tile it happens to fall on.
        */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(${-grid.pin.x}px, ${-grid.pin.y}px)` }}
        >
          {grid.tiles.map((tile) => {
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
                loading="lazy"
                decoding="async"
                onError={() => setMissing((prev) => new Set(prev).add(key))}
                className="absolute max-w-none"
                style={{ left: tile.left, top: tile.top }}
              />
            );
          })}
        </div>

        {/* The pin, dead centre, because the grid was moved to put it there. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
        >
          <span className="bg-brand-600/25 absolute inline-flex size-6 rounded-full" />
          <span className="bg-brand-600 relative inline-flex size-3 rounded-full ring-2 ring-white" />
        </span>

        {/* Only worth drawing over a real map. */}
        {!blank && (
          <div className="pointer-events-none absolute bottom-2 start-2 flex flex-col gap-0.5">
            <span className="surface/90 rounded px-1 text-[10px] font-medium backdrop-blur-[2px]">
              {scale.label}
            </span>
            <span
              className="border-[var(--text)] border-b-2 border-s-2 border-e-2"
              style={{ width: Math.round(scale.widthPx), height: 5 }}
            />
          </div>
        )}

        {/*
          Required by the licence, not decoration. OpenStreetMap's data is
          ODbL and the attribution has to be visible on the map itself.
        */}
        {!blank && (
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer noopener"
            className="surface/90 absolute bottom-0 end-0 px-1 text-[10px] leading-4 backdrop-blur-[2px] hover:underline"
          >
            {t("hotel.mapCredit")}
          </a>
        )}
      </div>

      <figcaption className="text-muted mt-1.5 text-xs tabular">
        {lat.toFixed(4)}, {lng.toFixed(4)}
        {blank && <> · {t("hotel.mapUnavailable")}</>}
      </figcaption>
    </figure>
  );
}
