/**
 * Entries in a supplier's facility list that are not facilities.
 *
 * Both bed banks send things down the facilities array that describe the
 * property rather than offer anything: the word "hotel", the cards it accepts,
 * a distance with nothing named to measure from. Hotelbeds already drops the
 * measurements — "Total number of rooms", "Check-in hour" — and TourMind keeps
 * anything unmatched verbatim, which is right for a real amenity we have no
 * code for and wrong for these.
 *
 * It showed up in the trade comparison, where every column's facilities row
 * read "hotel · American Express · MasterCard": three identical rows of nothing
 * in a panel whose whole job is telling three properties apart. The results
 * cards had been carrying it all along, where it was easier to miss.
 *
 * One rule for both adapters rather than a copy in each. A duplicated rule is
 * how the TourMind path came to publish offer ids it had never stored: the
 * second copy simply never got written.
 *
 * Dropped rather than mapped, because there is nothing to map them to. What a
 * property charges on is a commercial detail we settle ourselves, its type is
 * already a field of its own, and a distance with no anchor is not a fact
 * anybody can act on.
 */
const NOISE = [
  /** The property type, which is already `propertyType`. */
  /^(hotel|motel|hostel|apartments?|apart[- ]?hotel|resort|guest ?house|inn|villa|lodge|b&b|bed (and|&) breakfast)$/i,
  /**
   * What it takes at the desk, which is not what the guest gets.
   *
   * Anchored, unlike the first draft. `/visa\b/` also matched "Visa
   * assistance", which is a real service a property performs for a guest who
   * needs one — the kind of thing an agent selling into the Gulf actively
   * looks for. A reject list that thins the catalogue is worse than the
   * cosmetic problem it was written to fix, and these only ever arrive as
   * standalone labels anyway.
   */
  /^(american express|amex|master ?card|visa|diners([- ]club)?|union ?pay|jcb|maestro|ec|cash( only)?|credit cards?|debit cards?)$/i,
  /** A distance with nothing named to measure from. */
  /^distance (from|to)\b/i,
];

/** Whether a supplier's facility label describes the property rather than offers anything. */
export function isAmenityNoise(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return true;
  return NOISE.some((pattern) => pattern.test(trimmed));
}
