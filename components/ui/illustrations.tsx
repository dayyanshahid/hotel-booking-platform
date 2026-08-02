/**
 * Spot illustrations for empty, error and outcome states (§11.2).
 *
 * Drawn in brand tokens rather than flat greys so an empty state reads as a
 * designed moment instead of a missing screen. Each is decorative: the heading
 * and body beside it carry the meaning, so they are hidden from assistive
 * technology.
 */

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 220 160"
      className={className ?? "h-32 w-auto"}
      fill="none"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

const brand = "var(--color-brand-500, #1c8288)";
const brandSoft = "var(--color-brand-200, #a8d9da)";
const sand = "var(--color-ember-100, #ffe3ce)";

/** No results: a map with nothing pinned on it. */
export function NoResultsArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <path d="M40 44 78 32l52 16 50-14v82l-50 14-52-16-38 12V44Z" fill={brandSoft} opacity="0.35" />
      <path d="M78 32v82M130 48v82" stroke={brand} strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />
      <path d="M40 44 78 32l52 16 50-14v82l-50 14-52-16-38 12V44Z" stroke={brand} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="110" cy="74" r="26" stroke={sand} strokeWidth="3" fill="none" />
      <path d="m130 94 16 16" stroke={sand} strokeWidth="4" strokeLinecap="round" />
      <path d="M100 74h20" stroke={sand} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

/** Saved list: an empty wishlist card. */
export function EmptySavedArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="46" y="30" width="128" height="100" rx="10" fill={brandSoft} opacity="0.3" />
      <rect x="46" y="30" width="128" height="100" rx="10" stroke={brand} strokeWidth="2.5" />
      <path d="M46 96l30-26 24 20 22-18 32 26" stroke={brand} strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      <circle cx="88" cy="58" r="9" fill={sand} opacity="0.8" />
      <path
        d="M110 132s-22-13-22-27a12 12 0 0 1 22-6 12 12 0 0 1 22 6c0 14-22 27-22 27Z"
        fill="var(--surface)"
        stroke={sand}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Trips: a suitcase with a boarding tag. */
export function EmptyTripsArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="58" y="52" width="104" height="80" rx="12" fill={brandSoft} opacity="0.35" />
      <rect x="58" y="52" width="104" height="80" rx="12" stroke={brand} strokeWidth="2.5" />
      <path d="M88 52V38a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v14" stroke={brand} strokeWidth="2.5" />
      <path d="M58 88h104" stroke={brand} strokeWidth="2.5" opacity="0.6" />
      <rect x="74" y="132" width="10" height="12" rx="3" fill={brand} opacity="0.7" />
      <rect x="136" y="132" width="10" height="12" rx="3" fill={brand} opacity="0.7" />
      <path d="M168 44l22-10-6 14 6 14-22-10Z" fill={sand} />
    </Frame>
  );
}

/** Confirmed: a document with a check seal. */
export function BookingConfirmedArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="54" y="24" width="98" height="118" rx="10" fill="var(--surface)" stroke={brand} strokeWidth="2.5" />
      <path d="M72 54h62M72 74h62M72 94h40" stroke={brandSoft} strokeWidth="4" strokeLinecap="round" />
      <circle cx="156" cy="112" r="30" fill="var(--color-positive-500, #1a8a4a)" />
      <path d="m143 112 9 9 18-19" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Frame>
  );
}

/** Pending: an hourglass mid-flow. */
export function BookingPendingArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="72" y="22" width="76" height="8" rx="4" fill={brand} />
      <rect x="72" y="130" width="76" height="8" rx="4" fill={brand} />
      <path d="M84 30h52v18l-26 28 26 28v18H84v-18l26-28-26-28V30Z" fill={brandSoft} opacity="0.4" stroke={brand} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M96 42h28l-14 16-14-16Z" fill={sand} />
      <path d="M110 100l14 22H96l14-22Z" fill={sand} />
      <circle cx="110" cy="80" r="3" fill={sand} />
    </Frame>
  );
}

/** Support: a conversation. */
export function SupportArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="34" y="34" width="108" height="72" rx="14" fill={brandSoft} opacity="0.35" stroke={brand} strokeWidth="2.5" />
      <path d="M58 106l-6 22 30-22" fill={brandSoft} opacity="0.35" stroke={brand} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M58 60h60M58 80h38" stroke={brand} strokeWidth="3.5" strokeLinecap="round" opacity="0.7" />
      <rect x="118" y="72" width="72" height="52" rx="12" fill="var(--surface)" stroke={sand} strokeWidth="2.5" />
      <path d="M172 124l6 16-22-16" fill="var(--surface)" stroke={sand} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M134 92h40M134 106h26" stroke={sand} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

/** Service disruption: a cloud that could not answer. */
export function ServiceIssueArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <path
        d="M64 104a26 26 0 0 1 4-52 34 34 0 0 1 64-6 24 24 0 0 1 6 58H64Z"
        fill={brandSoft}
        opacity="0.35"
        stroke={brand}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M110 66v20M110 96h.01" stroke={sand} strokeWidth="5" strokeLinecap="round" />
      <path d="M60 128l16-10M110 134v-12M160 128l-16-10" stroke={brand} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </Frame>
  );
}

/** Not found: a key that opens nothing. */
export function NotFoundArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <circle cx="76" cy="80" r="30" fill={brandSoft} opacity="0.35" stroke={brand} strokeWidth="2.5" />
      <circle cx="76" cy="80" r="11" fill="var(--surface)" stroke={brand} strokeWidth="2.5" />
      <path d="M106 80h68l10 10 10-10" stroke={brand} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M140 80v20M162 80v14" stroke={brand} strokeWidth="2.5" strokeLinecap="round" />
      <path d="m54 44 44 72" stroke={sand} strokeWidth="4" strokeLinecap="round" />
    </Frame>
  );
}
