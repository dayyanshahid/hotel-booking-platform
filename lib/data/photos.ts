/**
 * Curated photography for the demo catalogue.
 *
 * Every identifier below was viewed before it was added — the sets hold only
 * frames that read as hospitality imagery at card size: no faces in the
 * foreground, no food close-ups where a restaurant is meant, no stock-watermark
 * crops. They are served from the Unsplash image CDN, which supports the same
 * width/format negotiation a production DAM would (§12.2), so the app can ship
 * a real `srcset` rather than one fixed-size file.
 *
 * These are **illustrative stock photographs, not the actual properties**. The
 * scope forbids presenting imagery in a way that misleads about what a guest is
 * buying (§2.2, §8.3), so every image carries {@link PHOTO_CREDIT} as its credit
 * line and the UI renders it beside the caption. Live Hotelbeds properties use
 * the supplier's own photography instead — this only backs the demo catalogue.
 *
 * If the CDN is unreachable the UI falls back to the deterministic SVG
 * illustrator in `lib/illustration/scenes.ts`, so no card ever renders empty.
 */

import type { HotelImage, Locale } from "@/lib/types";

export type PhotoCategory = HotelImage["category"];

/** Shown next to the caption wherever demo imagery appears. */
export const PHOTO_CREDIT: Record<Locale, string> = {
  en: "Illustrative photography · Unsplash",
  ar: "صور توضيحية · Unsplash",
};

/**
 * Widths offered to the browser. The largest covers a full-bleed hero on a 2×
 * display; the smallest covers a phone-width card at 1×.
 */
const WIDTHS = [400, 640, 960, 1440, 1920] as const;

/** Default width when a caller does not describe its layout. */
const DEFAULT_WIDTH = 960;

/* --------------------------------------------------------------- the sets */

/**
 * Property imagery by room type. Ordering is meaningless — the picker hashes
 * into these, so adding to the end does not reshuffle existing pages.
 */
const PROPERTY_SETS: Record<Exclude<PhotoCategory, "view">, readonly string[]> = {
  // Frames carrying a legible hotel brand or a globally recognisable property
  // are deliberately excluded: attaching one to a made-up hotel name would be a
  // misrepresentation the credit line cannot undo.
  exterior: [
    "1468824357306-a439d58ccb1c",
    "1711743266323-5badf42d4797",
    "1668480441891-3744c25337a3",
    "1607320895054-c5c543e9a069",
    "1472510771109-39b92752a6b9",
    "1661016630713-67e36bfc2285",
    "1693146842813-be42935ecdbd",
  ],
  room: [
    "1618773928121-c32242e63f39",
    "1611892440504-42a792e24d32",
    "1629140727571-9b5c6f6267b4",
    "1631049307264-da0ec9d70304",
    "1631049552057-403cdb8f0658",
    "1711059985570-4c32ed12a12c",
    "1583847268964-b28dc8f51f92",
    "1582719478250-c89cae4dc85b",
    "1566665797739-1674de7a421a",
    "1568495248636-6432b97bd949",
    "1590490360182-c33d57733427",
  ],
  lobby: [
    "1621293954908-907159247fc8",
    "1625244724120-1fd1d34d00f6",
    "1660557989695-14fac79c086d",
    "1573052905904-34ad8c27f0cc",
    "1611048267451-e6ed903d4a38",
    "1587702068694-a909ef4aa346",
    "1583953458882-302655b5c376",
    "1660557989725-f511e9fa6267",
    "1590447158019-883d8d5f8bc7",
    "1546967900-1bea5f16b69d",
  ],
  pool: [
    "1549294413-26f195200c16",
    "1520250497591-112f2f40a3f4",
    "1604348825621-22800b6ed16d",
    "1582719508461-905c673771fd",
    "1623718649591-311775a30c43",
    "1586611292717-f828b167408c",
    "1529290130-4ca3753253ae",
    "1597221336986-7a948756cd3a",
    "1587870306141-4f19861e6c73",
    "1569335468885-d7d1a41e570c",
    "1563493653502-9e270be23596",
  ],
  dining: [
    "1414235077428-338989a2e8c0",
    "1551632436-cbf8dd35adfa",
    "1560053608-13721e0d69e8",
    "1593270797842-4b8e6cecd2b2",
    "1559339352-11d035aa65de",
    "1692153142524-60285a93c249",
  ],
};

/**
 * Destination imagery, keyed by destination slug. Used for the destination
 * heroes and for the "view from the property" frame, which should show the city
 * the guest is actually booking into rather than a generic skyline.
 */
const DESTINATION_SETS: Record<string, readonly string[]> = {
  riyadh: ["1663900108404-a05e8bf82cda", "1694018359679-49465b4c0d61", "1758798219572-512a03a60ce0"],
  jeddah: [
    "1586715065342-98d1f6016fd1",
    "1699954669485-812988f5c2db",
    "1585085952480-811ff8859fa1",
    "1674979724572-c0a0579bc9d0",
  ],
  makkah: ["1580418827493-f2b22c0a76cb", "1627728734379-a5f8c099763e", "1592326871020-04f58c1a52f3"],
  dubai: [
    "1512453979798-5ea266f8880c",
    "1518684079-3c830dcef090",
    "1546412414-e1885259563a",
    "1580674684081-7617fbf3d745",
    "1546412414-8035e1776c9a",
    "1543579596-2c11997c7706",
    "1526495124232-a04e1849168c",
  ],
  doha: [
    "1700901742651-6b353164caf3",
    "1647252262017-582a7dbb73d0",
    "1669300884869-e6e11c67c031",
    "1539475314840-751cecc1dacd",
    "1685113872064-de4180a0ea93",
    "1604433203862-93bc73b0f1e9",
  ],
  istanbul: [
    "1524231757912-21f4fe3a7200",
    "1527838832700-5059252407fa",
    "1589561454226-796a8aa89b05",
    "1564407727371-3eece6c58961",
    "1626956291772-3aa243614fd0",
    "1518084823714-2f59a7315a39",
    "1567527259232-3a7fcd490c55",
    "1564428366891-dc20b1edf33b",
  ],
};

/**
 * Collections get a named photo rather than a hashed one. There are only eight
 * of them and they sit side by side on one grid, where a repeat is obvious —
 * and several share a category, which is exactly when the hash collides.
 */
const COLLECTION_PHOTO: Record<string, string> = {
  family: "1611892440504-42a792e24d32",
  accessible: "1568495248636-6432b97bd949",
  business: "1590447158019-883d8d5f8bc7",
  luxury: "1660557989725-f511e9fa6267",
  beach: "1563493653502-9e270be23596",
  city: "1668480441891-3744c25337a3",
  value: "1631049307264-da0ec9d70304",
  // Not the hero's frame: the two sit on the home page together.
  lastminute: "1758798219572-512a03a60ce0",
};

/* ------------------------------------------------------------ the picker */

/** FNV-1a. Small, stable across runtimes, and good enough to spread ~20 slugs. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function setFor(category: PhotoCategory, destination?: string): readonly string[] {
  if (category === "view") {
    return (destination && DESTINATION_SETS[destination]) || DESTINATION_SETS.riyadh;
  }
  return PROPERTY_SETS[category];
}

/**
 * Resolve one photo identifier.
 *
 * `key` scopes the choice (a hotel slug, a collection slug, a destination) and
 * `ordinal` walks the set from there, so several photos requested under the
 * same key and category never collide until the set is exhausted.
 */
function pick(key: string, category: PhotoCategory, ordinal: number, destination?: string): string {
  const set = setFor(category, destination);
  return set[(hash(`${key}:${category}`) + ordinal) % set.length];
}

/**
 * Named slot shapes. The CDN crops to the shape the layout actually renders, so
 * a portrait source lands as a usable landscape instead of a centred sliver —
 * and the browser stops downloading pixels that `object-cover` would discard.
 */
export const PHOTO_SHAPE = {
  banner: 21 / 6,
  strip: 16 / 7,
  card: 16 / 9,
  frame: 4 / 3,
  square: 1,
} as const;

export type PhotoShape = (typeof PHOTO_SHAPE)[keyof typeof PHOTO_SHAPE];

function cdn(id: string, width: number, shape?: number): string {
  const size = shape ? `w=${width}&h=${Math.round(width / shape)}` : `w=${width}`;
  // `crop=entropy` picks the busiest region rather than the geometric centre,
  // which is what keeps a building in frame when a tall photo is cut down.
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=entropy&q=72&${size}`;
}

export interface PhotoRef {
  src: string;
  srcSet: string;
}

interface PhotoOptions {
  width?: number;
  /** Aspect ratio of the slot this photo renders into — see {@link PHOTO_SHAPE}. */
  shape?: number;
}

function refFor(id: string, options: PhotoOptions): PhotoRef {
  const width = options.width ?? DEFAULT_WIDTH;
  return {
    src: cdn(id, width, options.shape),
    srcSet: WIDTHS.map((w) => `${cdn(id, w, options.shape)} ${w}w`).join(", "),
  };
}

/** A property photo — the demo catalogue's equivalent of a supplier image. */
export function propertyPhoto(
  key: string,
  category: PhotoCategory,
  ordinal = 0,
  options: PhotoOptions & { destination?: string } = {},
): PhotoRef {
  return refFor(pick(key, category, ordinal, options.destination), options);
}

/** A destination hero. */
export function destinationPhoto(slug: string, ordinal = 0, options: PhotoOptions = {}): PhotoRef {
  const set = DESTINATION_SETS[slug];
  if (!set) return propertyPhoto(slug, "exterior", ordinal, options);
  return refFor(set[ordinal % set.length], options);
}

/**
 * The home hero. Fixed rather than hashed: it is the first thing a visitor
 * sees, so it should not change between deploys for no reason. Left uncropped,
 * because the band is a wide letterbox on a desktop and nearly a portrait on a
 * phone — one server-side crop cannot serve both.
 */
export function heroPhoto(width = 1920): PhotoRef {
  // A night skyline: wide enough to survive the hero's crop on a desktop band
  // and dark enough that white type clears contrast at every viewport.
  return refFor(DESTINATION_SETS.riyadh[0], { width });
}

/** A collection card. */
export function collectionPhoto(slug: string, tag: string, options: PhotoOptions = {}): PhotoRef {
  const id = COLLECTION_PHOTO[tag];
  return id ? refFor(id, options) : propertyPhoto(`collection-${slug}`, "exterior", 0, options);
}
