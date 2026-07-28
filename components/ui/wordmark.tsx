/**
 * The Travel & More logo.
 *
 * Two parts, deliberately separable: the tiled globe and the wordmark. The
 * globe carries the brand on its own at small sizes — a favicon, a collapsed
 * header, a print corner — where two lines of caps would be unreadable, so it
 * is drawn here rather than imported as one flat image with the type baked in.
 *
 * The mark is inline SVG rather than an `<img>` so it can sit on either ground
 * without shipping a second file. The geometry comes from
 * `scripts/build-brand-mark.ts` — hand-editing sixty rounded rectangles on a
 * sphere is not a maintenance plan.
 */

import { GLOBE_TILES } from "./globe-tiles";

export function GlobeMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 248 200"
      width={(size * 248) / 200}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {GLOBE_TILES.map((tile, i) => (
        <rect
          key={i}
          x={tile.x}
          y={tile.y}
          width={tile.w}
          height={tile.w}
          rx={tile.r}
          fill={tile.f}
          opacity={tile.o}
          transform={tile.t}
        />
      ))}
    </svg>
  );
}

export function Wordmark({
  className,
  tone = "brand",
  showSince = false,
  /** Drops the type and keeps the globe — for tight chrome and print corners. */
  markOnly = false,
}: {
  className?: string;
  /** "brand" on light ground, "inverse" on the charcoal chrome. */
  tone?: "brand" | "inverse";
  /** Adds the "serving since 1984" line beneath. */
  showSince?: boolean;
  markOnly?: boolean;
}) {
  const type = tone === "inverse" ? "text-brand-300" : "text-brand-500";
  const sub = tone === "inverse" ? "text-white/60" : "text-[var(--text-muted)]";

  if (markOnly) {
    return (
      <span className={className}>
        <GlobeMark size={30} />
        <span className="sr-only">Travel &amp; More Private Limited</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <GlobeMark size={34} className="shrink-0" />
      <span>
        {/*
          Two lines at different weights, as in the artwork: the trading name
          carries the brand and "PRIVATE LIMITED" is the legal tail. Tight
          tracking and a short line-height keep the block reading as one lockup
          rather than two stacked labels.
        */}
        <span className={`block text-[17px] font-extrabold leading-[1.05] tracking-[-0.01em] ${type}`}>
          TRAVEL &amp; MORE
        </span>
        <span className={`block text-[11.5px] font-bold leading-[1.15] tracking-[0.06em] ${type}`}>
          PRIVATE LIMITED
        </span>
        {showSince && (
          <span className={`mt-1 block text-[10px] font-medium leading-tight ${sub}`}>Serving since 1984</span>
        )}
      </span>
    </span>
  );
}
