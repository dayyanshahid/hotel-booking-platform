/**
 * Colour arithmetic, and nothing else.
 *
 * Split out of `branding` because that module reaches for `apiUrl` to resolve a
 * logo, which drags a browser's notion of where the API lives into anything
 * that only wanted to validate a colour — including the settings route, which
 * runs on a server and has no origin to resolve against.
 *
 * These functions take a string and return a string. Keeping them free of
 * every other concern is what lets both the screens and the API use the same
 * one, which is the whole point: a colour an agency previews has to be the
 * colour that gets stored.
 */

/**
 * A hex colour in canonical `#rrggbb`, or null if it is not one.
 *
 * Accepts what people actually paste — with or without the hash, three digits
 * or six, any case — because rejecting `abc123` on a technicality is a support
 * ticket, not a validation. Anything else is refused rather than coerced: a
 * colour we guessed at would end up printed on a customer's paperwork.
 */
export function normalizeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null;
}
