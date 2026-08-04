import "server-only";
import { suggestAll } from "./search";
import { addDays, nightsBetween, todayIso } from "../format";
import { isCurrencyCode } from "../currencies";
import type { CurrencyCode, Locale, SearchFilters, SearchIntent } from "../types";
import type { Interpretation } from "../types";

/**
 * Turning a sentence into a search.
 *
 * The previous version recognised six hard-coded cities out of the hundred and
 * eighty-three the catalogue holds, parsed a night count and threw it away,
 * never produced dates or a destination id, and offered no way to act on what
 * it had understood. It looked like a feature and did almost nothing.
 *
 * This resolves the destination through the same suggestion index the search
 * bar uses — so it knows every city we can sell, in both languages, plus live
 * supplier destinations — and returns a real intent that the search page can be
 * run with.
 *
 * It is deliberately rule-based rather than a model call. Every rule here is
 * inspectable and testable, it costs nothing per query, and it cannot invent a
 * destination we do not sell. Where it has to guess it says so, and the guesses
 * are listed separately from the facts so the UI can show what was assumed
 * rather than presenting an invention as an understanding.
 */

export type { Interpretation };

/** Month names it can recognise, in both languages, in the order they occur. */
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, يناير: 0,
  february: 1, feb: 1, فبراير: 1,
  march: 2, mar: 2, مارس: 2,
  april: 3, apr: 3, أبريل: 3, ابريل: 3,
  may: 4, مايو: 4,
  june: 5, jun: 5, يونيو: 5,
  july: 6, jul: 6, يوليو: 6,
  august: 7, aug: 7, أغسطس: 7, اغسطس: 7,
  september: 8, sep: 8, sept: 8, سبتمبر: 8,
  october: 9, oct: 9, أكتوبر: 9, اكتوبر: 9,
  november: 10, nov: 10, نوفمبر: 10,
  december: 11, dec: 11, ديسمبر: 11,
};

/**
 * Numbers written as words.
 *
 * "Two rooms in Porto" read as one room and, worse, resolved the destination to
 * a hotel called Two Seasons — the word was not a number to the parser, so it
 * survived into the place lookup and matched a property name. People type
 * numbers both ways, and a request for two rooms that quietly books one is the
 * kind of confident wrong answer that makes the feature untrustworthy.
 *
 * Rewriting them to digits first fixes both halves at once: the counts parse,
 * and the token stops looking like a place name.
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  واحد: 1, واحدة: 1,
  اثنان: 2, اثنين: 2, اثنتين: 2, اثنتان: 2,
  ثلاث: 3, ثلاثة: 3,
  أربع: 4, اربع: 4, أربعة: 4, اربعة: 4,
  خمس: 5, خمسة: 5,
  ست: 6, ستة: 6,
  سبع: 7, سبعة: 7,
  ثماني: 8, ثمانية: 8,
  تسع: 9, تسعة: 9,
  عشر: 10, عشرة: 10,
};

function numeralise(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    const value = NUMBER_WORDS[word];
    return value === undefined ? word : String(value);
  });
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * When the stay starts.
 *
 * Anything in the past is pushed to next year: "in March" said in April means
 * next March, and booking someone into a date that has been and gone is worse
 * than being a year out.
 */
function readStart(text: string, today: string): { checkIn: string | null; how: string | null } {
  const now = new Date(`${today}T00:00:00Z`);

  if (/\btomorrow\b|\bغدا\b|\bغدًا\b/.test(text)) return { checkIn: addDays(today, 1), how: "tomorrow" };
  if (/\btonight\b|\bالليلة\b/.test(text)) return { checkIn: today, how: "tonight" };
  if (/\bnext week\b|الأسبوع القادم|الاسبوع القادم/.test(text)) return { checkIn: addDays(today, 7), how: "next week" };
  if (/\bnext month\b|الشهر القادم/.test(text)) return { checkIn: addDays(today, 30), how: "next month" };

  // "this weekend" / "next weekend" — the coming Friday either way.
  if (/\bweekend\b|عطلة نهاية الأسبوع|ويكند/.test(text)) {
    const day = now.getUTCDay();
    const untilFriday = (5 - day + 7) % 7 || 7;
    const offset = /\bnext\b|القادم/.test(text) ? untilFriday + 7 : untilFriday;
    return { checkIn: addDays(today, offset), how: "the coming weekend" };
  }

  // "12 March", "March 12", "12/03", "2027-03-12".
  const explicit = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (explicit) return { checkIn: explicit[0], how: "the date given" };

  /*
   * Every number-beside-a-word pair, not just the first.
   *
   * "2 rooms in Zurich 12 August" starts with "2 rooms", which is not a date.
   * Taking only the first match let that pair consume the attempt and the real
   * date fell through to a bare-month guess — the guest typed the 12th and was
   * quietly given the 1st. An explicit date is the one thing that must never be
   * silently replaced by an assumption.
   */
  const pairs = [
    ...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-zء-ي]+)/g),
    ...text.matchAll(/\b([a-zء-ي]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/g),
  ];
  for (const [, a, b] of pairs) {
    const numeric = Number.isNaN(Number(a)) ? b : a;
    const word = Number.isNaN(Number(a)) ? a : b;
    const day = Number(numeric);
    const month = MONTHS[word.toLowerCase()];
    if (month === undefined || !day || day > 31) continue;
    let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day));
    if (iso(candidate) < today) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, month, day));
    return { checkIn: iso(candidate), how: "the date given" };
  }

  // A bare month: "in August" starts on the first we can still sell.
  for (const [name, month] of Object.entries(MONTHS)) {
    if (!new RegExp(`\\b${name}\\b`).test(text)) continue;
    let candidate = new Date(Date.UTC(now.getUTCFullYear(), month, 1));
    if (iso(candidate) < today) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, month, 1));
    return { checkIn: iso(candidate), how: `the start of ${name}` };
  }

  return { checkIn: null, how: null };
}

export async function interpretTrip(
  text: string,
  locale: Locale,
  currency: CurrencyCode,
  today = todayIso(),
): Promise<Interpretation> {
  const lower = numeralise(text.toLowerCase().trim());
  const understood: string[] = [];
  const assumed: string[] = [];
  const missing: string[] = [];
  const filters: SearchFilters = {};

  /* ------------------------------------------------------------ occupancy */

  /*
   * "Family of four" is how people say four guests — and it is the example we
   * print in the field's own placeholder, so it had better work. Read as a
   * party size rather than an adult count: any children stated separately come
   * out of it, and what remains are the adults.
   */
  const party = Number(lower.match(/(?:family|party|group)\s+of\s+(\d+)|(?:عائلة|مجموعة)\s+من\s+(\d+)/)?.slice(1).find(Boolean) ?? 0);
  const statedAdults = Number(lower.match(/(\d+)\s*(adults?|people|guests?|بالغ|أشخاص|اشخاص)/)?.[1] ?? 0);
  const childCount = Number(lower.match(/(\d+)\s*(child|children|kids?|طفل|أطفال|اطفال)/)?.[1] ?? 0);
  const adults = statedAdults || Math.max(0, party - childCount);
  const roomCount = Number(lower.match(/(\d+)\s*(rooms?|غرف|غرفة)/)?.[1] ?? 0);

  // Ages matter: a child without one cannot be priced, so they are assumed at
  // eight and the assumption is stated rather than buried.
  /*
   * "aged 6 and 9" is one phrase listing two ages, not one age.
   *
   * Matching only `aged (\d+)` read the 6 and silently invented an 8 for the
   * second child — a made-up age is a mispriced booking and, at check-in, a
   * child the property was never told about.
   */
  const ageList = lower.match(/(?:aged?|عمر)\s*([\d\s,and&و]+)/)?.[1] ?? "";
  const ages = [...ageList.matchAll(/\d{1,2}/g)]
    .map((match) => Number(match[0]))
    .filter((age) => age >= 0 && age <= 17);

  const childrenAges = childCount
    ? Array.from({ length: childCount }, (_, i) => ages[i] ?? 8)
    : ages;

  if (adults) understood.push(`${adults} adults`);
  if (childrenAges.length) understood.push(`${childrenAges.length} children`);
  if (childCount && ages.length < childCount) assumed.push("children aged 8 where no age was given");

  const rooms = roomCount || 1;
  if (roomCount > 1) understood.push(`${roomCount} rooms`);

  const perRoomAdults = Math.max(1, Math.round((adults || 2) / rooms));
  const allocation = Array.from({ length: rooms }, (_, index) => ({
    adults: perRoomAdults,
    // Children ride in the first room unless the sentence said otherwise, which
    // it almost never does.
    childrenAges: index === 0 ? childrenAges : [],
  }));
  if (!adults) assumed.push("2 adults");

  /* ----------------------------------------------------------------- dates */

  const { checkIn, how } = readStart(lower, today);
  const nights = Number(lower.match(/(\d+)\s*(nights?|ليال|ليلة|ليالي)/)?.[1] ?? 0);
  if (nights) understood.push(`${nights} nights`);

  const start = checkIn ?? addDays(today, 14);
  if (how) understood.push(how);
  else assumed.push("in two weeks");
  const stay = nights || 3;
  if (!nights) assumed.push("3 nights");

  /* ----------------------------------------------------- what they care about */

  if (/(free cancel|refundable|قابل للإلغاء|إلغاء مجاني)/.test(lower)) {
    /*
     * The three-way condition rather than the old boolean, so the sidebar can
     * show what the sentence asked for. Setting `refundableOnly` left the
     * panel's rate-conditions boxes unticked while the results were narrowed —
     * a filter the agent could see the effect of but not the state of.
     */
    filters.rateConditions = ["free"];
    understood.push("free cancellation");
  }
  if (/(breakfast|إفطار|افطار)/.test(lower)) {
    filters.boards = ["BB"];
    understood.push("breakfast");
  }
  if (/(pay later|pay at|ادفع لاحقا|الدفع لاحقًا)/.test(lower)) {
    filters.payLaterOnly = true;
    understood.push("pay later");
  }
  if (/(accessible|wheelchair|ذوي الإعاقة|كرسي متحرك)/.test(lower)) {
    filters.accessibleOnly = true;
    understood.push("step-free access");
  }
  const stars = Number(lower.match(/(\d)\s*[-\s]?(star|stars|نجوم|نجمة)/)?.[1] ?? 0);
  if (stars >= 1 && stars <= 5) {
    filters.categories = [stars];
    understood.push(`${stars} star`);
  }
  // "under 200", "below $150 a night" — a nightly ceiling becomes a stay total,
  // because that is what the price on a card actually is.
  const budget = Number(lower.match(/(?:under|below|max|less than|أقل من|حتى)\s*\$?\s*(\d{2,5})/)?.[1] ?? 0);
  if (budget) {
    const perNight = /(a night|per night|nightly|في الليلة|لليلة)/.test(lower);
    filters.maxPrice = perNight ? budget * stay : budget;
    understood.push(perNight ? `under ${budget} a night` : `under ${budget} total`);
  }

  /* ----------------------------------------------------------- destination */

  /*
   * Resolved against the real suggestion index rather than a list of city
   * names in a regex. That index already knows every city we sell, in both
   * languages, plus whatever the live suppliers cover — so this cannot offer a
   * destination we have no inventory for, and it improves whenever the
   * catalogue does.
   *
   * Words that are never a place are stripped first: "family" matched a city in
   * testing, which is exactly the kind of confident wrong answer that makes a
   * feature untrustworthy.
   */
  const stop = new Set([
    "a","an","the","in","for","with","to","near","and","or","of","my","we","us","i","need","want","looking","trip",
    "hotel","hotels","stay","night","nights","room","rooms","adult","adults","child","children","kid","kids","star",
    "stars","free","cancellation","breakfast","cheap","under","below","budget","next","this","weekend","week","month",
    "tomorrow","tonight","family","business","beach","accessible","refundable","please","around","from","على","في",
    "من","إلى","مع","ليالي","ليلة","غرفة","غرف","فندق","رحلة",
  ]);
  const words = lower
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word) && !/^\d+$/.test(word) && !(word in MONTHS));

  let intent: SearchIntent | null = null;
  // Longest phrases first: "new york" should beat "york".
  const candidates = [
    ...words.map((_, i) => words.slice(i, i + 2).join(" ")).filter((phrase) => phrase.includes(" ")),
    ...words,
  ];

  /*
   * A place anywhere in the sentence beats a hotel anywhere in it.
   *
   * Stopping at the first word that matched *anything* meant an early word
   * hitting a property name won outright, and the city named two words later
   * was never looked at — "two rooms in Porto" searched a hotel called Two
   * Seasons in Dubai. Hotels are still resolvable, but only when nothing in the
   * sentence names a place.
   */
  let fallback: Awaited<ReturnType<typeof suggestAll>>[number] | null = null;
  for (const candidate of candidates) {
    const matches = await suggestAll(candidate, locale, 3);
    const place = matches.find((match) => match.type !== "hotel");
    if (!place) {
      fallback ??= matches[0] ?? null;
      continue;
    }
    fallback = place;
    break;
  }

  if (fallback) {
    understood.push(fallback.label);
    intent = {
      destinationId: fallback.id,
      destinationDisplay: fallback.label,
      destinationType: fallback.type,
      checkIn: start,
      checkOut: addDays(start, stay),
      flexibility: checkIn ? "exact" : "p3",
      rooms: allocation,
      locale,
      currency: isCurrencyCode(currency) ? currency : "USD",
    };
  }

  if (!intent) missing.push("destination");

  return { intent, filters, understood, assumed, missing };
}

/** Exposed for tests: how long the parsed stay is. */
export function stayLength(intent: SearchIntent): number {
  return nightsBetween(intent.checkIn, intent.checkOut);
}
