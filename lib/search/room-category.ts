/**
 * What kind of room a supplier's room name describes.
 *
 * Neither Hotelbeds nor TourMind publishes a room *category* — they publish a
 * name, written by the hotel, in whatever house style it uses: "DELUXE ROOM
 * KING BED", "Chambre Supérieure", "1 BEDROOM APARTMENT SEA VIEW". An agent
 * whose customer wants a suite cannot search a hundred rows of that by eye, so
 * the category is read out of the name here.
 *
 * Order is the whole design. "Junior Suite" is not a suite in the sense anyone
 * shopping for a suite means, and "Family Suite" is a family room before it is
 * a suite — so the specific patterns are tested before the general ones and the
 * first match wins. A name that matches nothing stays uncategorised rather than
 * being forced into "standard", because a wrong category is worse than none:
 * it puts a room in a filter the agent then trusts.
 */
export type RoomCategory =
  | "studio"
  | "standard"
  | "superior"
  | "deluxe"
  | "executive"
  | "juniorSuite"
  | "suite"
  | "family"
  | "apartment"
  | "villa";

/** Ordered most specific first; the first pattern to match decides. */
const PATTERNS: { category: RoomCategory; test: RegExp }[] = [
  { category: "villa", test: /\b(villa|bungalow|chalet|riad)\b/ },
  { category: "juniorSuite", test: /\b(junior|jr\.?)\s*suite\b/ },
  { category: "family", test: /\b(family|famille|familiale?|familia|familiar|triple|quadruple|quad)\b/ },
  { category: "apartment", test: /\b(apartment|apartamento|apart|aparthotel|residence|penthouse|duplex)\b/ },
  { category: "suite", test: /\b(suite|suit)\b/ },
  { category: "studio", test: /\b(studio|estudio)\b/ },
  { category: "executive", test: /\b(executive|business|club|premier|premium|signature)\b/ },
  { category: "deluxe", test: /\b(deluxe|de luxe|luxury|luxe|lujo)\b/ },
  { category: "superior", test: /\b(superior|superieure?|superiore|comfort|classic|clasica)\b/ },
  { category: "standard", test: /\b(standard|estandar|economy|budget|basic|traditional|guest room)\b/ },
];

/**
 * Strips the noise a room name carries around its category.
 *
 * Bed configuration, view and occupancy are the three things every supplier
 * appends, and they collide: "1 KING BED" contains "king", "CITY VIEW SUPERIOR"
 * puts the category last. Lowercasing and flattening punctuation is enough —
 * the patterns are anchored on words, so the extra text is harmless once it
 * cannot merge with a word next to it.
 *
 * The patterns carry the Romance spellings too — suppliers send "Chambre
 * Supérieure" and "Habitación Estándar" unchanged, and a category that only
 * reads English quietly drops every property in France and Spain out of the
 * filter rather than failing loudly.
 */
function fold(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The category a room name describes, or null when it says nothing useful. */
export function roomCategoryOf(name: string): RoomCategory | null {
  if (!name) return null;
  const folded = fold(name);
  for (const { category, test } of PATTERNS) {
    if (test.test(folded)) return category;
  }
  return null;
}

/** Display order — roughly how a hotel would list them, cheapest kind first. */
export const ROOM_CATEGORY_ORDER: RoomCategory[] = [
  "standard",
  "superior",
  "deluxe",
  "executive",
  "studio",
  "juniorSuite",
  "suite",
  "family",
  "apartment",
  "villa",
];
