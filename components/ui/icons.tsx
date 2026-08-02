import type { SVGProps } from "react";

/**
 * Icon set (§7.1 foundations — iconography).
 *
 * One inline stroke-based system at a 24px grid, drawn in `currentColor` so an
 * icon always inherits the contrast of the text beside it. Icons are decorative
 * by default: every one is `aria-hidden` unless given a `title`, because the
 * label next to it already carries the meaning (§12.1 — icons never become the
 * only cue).
 */

export type IconName = keyof typeof PATHS;

/** Path data only — the wrapper supplies sizing, colour and accessibility. */
const PATHS = {
  /* ------------------------------------------------------------- interface */
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2",
  calendar: "M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7ZM4 10h16M8 3v4M16 3v4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M16.5 11.5a3 3 0 0 0 0-6M17 20a5.5 5.5 0 0 0-1.6-3.9",
  heart: "M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 3C19.5 15.4 12 20 12 20Z",
  star: "M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9L12 3.5Z",
  pin: "M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21ZM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  map: "M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4ZM9 4v13M15 6.5v13",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  filter: "M4 5h16l-6 7.2V19l-4 2v-8.8L4 5Z",
  sort: "M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3",
  chevronRight: "m9 5 7 7-7 7",
  chevronDown: "m5 9 7 7 7-7",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 13 4.5 4.5L19 7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.6h.01",
  alert: "M12 3.5 21.5 20h-19L12 3.5ZM12 10v4M12 17.2h.01",
  bell: "M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10.5 20a1.8 1.8 0 0 0 3 0",
  sparkle: "M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.6 10.4 12.2 5 10.6 10.4 9 12 3.5ZM18.5 16.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  print: "M7 9V4h10v5M7 18H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7v-6Z",
  share: "M12 15V4M12 4 8.5 7.5M12 4l3.5 3.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5",
  copy: "M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3M6 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  shield: "M12 3.5 19 6v6c0 4.4-3 7.4-7 8.5-4-1.1-7-4.1-7-8.5V6l7-2.5ZM9 12l2 2 4-4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  tag: "M4 11V5a1 1 0 0 1 1-1h6l9 9-7 7-9-9ZM8 8h.01",
  cart: "M3 4h2l2.5 10.5a2 2 0 0 0 2 1.5h7a2 2 0 0 0 2-1.5L20.5 8H6M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  trash: "M4 7h16M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6",
  card: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 10h18M6.5 15h3",
  home: "M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5.5h4V20",
  plane: "M10.5 20 12 15l7 4v-2.5l-5.5-4.5L21 8.5 20 6l-8 3.5L8 6.5 6 7.5l3 4.5-4 1.5 1 2 4-1 .5 5.5Z",
  phone: "M6.5 4h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0",
  chat: "M20 12a7.5 7.5 0 0 1-11 6.7L4 20l1.4-4.5A7.5 7.5 0 1 1 20 12Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 12h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1",
  receipt: "M6 3.5 7.5 5 9 3.5 10.5 5 12 3.5 13.5 5 15 3.5 16.5 5 18 3.5v17L16.5 19 15 20.5 13.5 19 12 20.5 10.5 19 9 20.5 7.5 19 6 20.5v-17ZM9 9h6M9 13h6",
  grid: "M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z",
  lifebuoy: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.7 5.7l3.8 3.8M14.5 14.5l3.8 3.8M18.3 5.7l-3.8 3.8M9.5 14.5l-3.8 3.8",

  /* -------------------------------------------------------------- amenities */
  wifi: "M2.5 9a15 15 0 0 1 19 0M6 12.5a10 10 0 0 1 12 0M9.2 16a5 5 0 0 1 5.6 0M12 19.5h.01",
  pool: "M3 17.5c1.5 0 1.5 1.2 3 1.2s1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2M8 15V6a2 2 0 0 1 4 0M16 15V6a2 2 0 0 0-4 0M8 9h4M8 12.5h4",
  gym: "M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10",
  spa: "M12 20c0-5 3-8 8-8 0 5-3 8-8 8ZM12 20c0-5-3-8-8-8 0 5 3 8 8 8ZM12 20c0-4.5 1.5-8 0-12-1.5 4 0 7.5 0 12Z",
  parking: "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM10 17V7h3a3 3 0 0 1 0 6h-3",
  dining: "M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 1-2 3-2 5s.5 3 2 3v10",
  family: "M8 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3.5 20v-3a4.5 4.5 0 0 1 9 0v3M14.5 20v-2.5a3.5 3.5 0 0 1 6-2.4",
  beach: "M4 20h16M12 20V9M12 9c-3.5-3.5-8-2-9 1 3.5-1.5 6.5 0 9-1ZM12 9c3.5-3.5 8-2 9 1-3.5-1.5-6.5 0-9-1Z",
  business: "M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8ZM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M3 13h18",
  transfer: "M5 17V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9M5 13h14M7.5 17v2M16.5 17v2M8 10h8M7.5 20h9",
  laundry: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM12 18a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM8 6h.01M11 6h.01",
  prayer: "M12 3.5c2.5 2 4 4.5 4 7.5v9H8v-9c0-3 1.5-5.5 4-7.5ZM12 3.5V2M8 20h8",
  ev: "M7 4h7l-2 6h4l-7 10 2-7H7l1.5-9ZM5 20h14",
  accessible: "M12 6a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 12 6ZM8 9h7M12 9v5h4l2 5M12 14a4.5 4.5 0 1 0 3 7.8",
  pet: "M9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 14a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 5 14ZM19 14a1.8 1.8 0 1 0 0-3.6A1.8 1.8 0 0 0 19 14ZM12 20.5c-2.5 0-4.5-1.4-4.5-3.4S9.5 12 12 12s4.5 3.1 4.5 5.1-2 3.4-4.5 3.4Z",
  concierge: "M4 18h16M5.5 18a6.5 6.5 0 0 1 13 0M12 11.5V9M12 6.5h.01",
  lounge: "M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M4 12h16v5H4v-5ZM6 17v2M18 17v2",
  aircon: "M4 6h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM7 16v1M12 16v2.5M17 16v1M7 10h10",
  minibar: "M8 3h8l-1 6a3 3 0 0 1-6 0L8 3ZM12 15v5M9 20h6M8.5 6h7",
  kettle: "M7 9h8v8a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V9ZM15 11h2a2 2 0 0 1 0 4h-2M9 6c0-1 .5-1.5 1.5-1.5S12 5 12 6",
  safe: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM13 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM17 9v6",
  desk: "M3 8h18M4 8v11M20 8v11M4 13h7v6M14 12h5",
  kitchen: "M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM4 11h16M8 6h.01M8 15h.01",
  balcony: "M4 10h16M6 10v10M18 10v10M10 10v10M14 10v10M4 20h16M6 10V6a6 6 0 0 1 12 0v4",
  bath: "M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM6 12V6a2 2 0 0 1 4 0M7 19v2M17 19v2",
  tv: "M4 6h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM8 21h8M12 17v4",
  quiet: "M11 5 6.5 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.5L11 19V5ZM16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10",
  bed: "M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M7 9V6.5A1.5 1.5 0 0 1 8.5 5h7A1.5 1.5 0 0 1 17 6.5V9M4 18v2M20 18v2",
  smoking: "M3 16h13v3H3v-3ZM18 16h3v3h-3v-3ZM17 13c2-1 2-3 0-4",
  building: "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V10h3a2 2 0 0 1 2 2v9M3 21h18M8 7h.01M11 7h.01M8 11h.01M11 11h.01M8 15h.01M11 15h.01",
} as const;

export function Icon({
  name,
  size = 20,
  title,
  className,
  strokeWidth = 1.7,
  ...props
}: {
  name: IconName;
  size?: number;
  /** Supplying a title makes the icon meaningful to assistive technology. */
  title?: string;
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Amenity codes → icons. Anything unmapped falls back to a neutral mark. */
const AMENITY_ICONS: Record<string, IconName> = {
  wifi: "wifi",
  pool: "pool",
  indoorPool: "pool",
  gym: "gym",
  spa: "spa",
  parking: "parking",
  valet: "parking",
  restaurant: "dining",
  roomService: "dining",
  familyRooms: "family",
  kidsClub: "family",
  beach: "beach",
  business: "business",
  meeting: "business",
  airportShuttle: "transfer",
  laundry: "laundry",
  prayerRoom: "prayer",
  evCharging: "ev",
  accessibleProperty: "accessible",
  petFriendly: "pet",
  concierge: "concierge",
  lounge: "lounge",
  aircon: "aircon",
  minibar: "minibar",
  kettle: "kettle",
  safe: "safe",
  desk: "desk",
  kitchenette: "kitchen",
  balcony: "balcony",
  bathtub: "bath",
  rollInShower: "accessible",
  soundproof: "quiet",
  smartTv: "tv",
};

export function amenityIcon(code: string): IconName {
  return AMENITY_ICONS[code] ?? "check";
}

/** A filled heart for the saved state — colour alone never carries meaning. */
export function HeartIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={PATHS.heart} />
    </svg>
  );
}

/** Star rating for property class, drawn as filled marks. */
export function StarRow({ count, size = 13 }: { count: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} fill="currentColor" focusable="false">
          <path d={PATHS.star} />
        </svg>
      ))}
    </span>
  );
}
