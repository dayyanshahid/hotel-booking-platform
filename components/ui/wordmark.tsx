/**
 * The Spatay wordmark.
 *
 * This is a *typographic stand-in*, not the supplied artwork. The brand mark is
 * custom lettering — the rounded S, the dotted descender on the Y — and no
 * amount of font tuning reproduces it. Drop the real file at
 * `public/brand/spatay.svg` and this component picks it up automatically; until
 * then it renders the name in the brand orange at the right weight so nothing
 * downstream has to change when the asset lands.
 *
 * Kept as a component rather than an <img> so it can invert on the dark chrome
 * without shipping two files.
 */

export function Wordmark({
  className,
  tone = "brand",
  showSince = false,
}: {
  className?: string;
  /** "brand" on light ground, "inverse" on the charcoal chrome. */
  tone?: "brand" | "inverse";
  /** Adds the "by Matchless · serving since 1984" line beneath. */
  showSince?: boolean;
}) {
  const mark = tone === "inverse" ? "text-brand-400" : "text-brand-500";
  const sub = tone === "inverse" ? "text-white/60" : "text-[var(--text-muted)]";
  return (
    <span className={className}>
      <span className={`block text-[22px] font-extrabold leading-none tracking-[-0.04em] ${mark}`}>
        Spatay
      </span>
      {showSince && (
        <span className={`mt-0.5 block text-[10px] font-medium leading-tight ${sub}`}>
          by Matchless · since 1984
        </span>
      )}
    </span>
  );
}
