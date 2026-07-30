import { apiUrl } from "../api-origin";
import type { Agency, AgencyProfile } from "./types";

/**
 * An agency's own identity on the documents its customers receive.
 *
 * A quotation and a voucher are the two things an agency hands over, and to the
 * traveller they are the agency's paperwork, not ours. Our name has no business
 * on either. This is the whole of what an agency controls, resolved once, so
 * the two documents cannot drift into looking like they came from different
 * companies.
 *
 * Deliberately free of server imports: the settings screen previews exactly
 * what the document will render, and it can only promise that if it is running
 * the same code.
 */

/** The mark, colour and wording a customer-facing document is built from. */
export interface Branding {
  /** The name at the top. The legal name if there is one, else the account's. */
  name: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxNumber?: string;
  /** The agency's own booking conditions, printed at the foot. */
  footer?: string;
  /** Accent, always a valid `#rrggbb`. Fills and rules — never small text. */
  color: string;
  /** Black or white — whichever can actually be read on `color`. */
  onColor: string;
  /** The accent as text on white: same hue, dark enough to read. */
  ink: string;
}

/**
 * The accent used when an agency has not chosen one.
 *
 * A neutral slate rather than our own brand colour: an agency that has not set
 * a colour should get a document that looks unbranded, not one that looks like
 * it came from us.
 */
export const DEFAULT_BRAND_COLOR = "#334155";

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

/** One sRGB channel, linearised for the luminance formula (WCAG 2.1). */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const value = normalizeHex(hex) ?? DEFAULT_BRAND_COLOR;
  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two relative luminances. */
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/*
 * Pure black rather than a soft near-black.
 *
 * The two inks have to cover the whole colour wheel between them, and the
 * hardest colour is the one where they are equally bad. With a near-black like
 * #111827 the best available contrast at that point is about 4.06:1, which is
 * under the 4.5:1 floor for body text — so on some perfectly ordinary mid-tone
 * brand colour there would be no readable choice at all. Pure black lifts the
 * worst case to about 4.58:1, and this is document ink on white paper, which is
 * exactly where pure black belongs.
 */
const DARK_INK = "#000000";
const LIGHT_INK = "#ffffff";

/**
 * Ink that can be read on top of a brand colour.
 *
 * An agency picks its brand colour from its own letterhead, and plenty of real
 * ones are pale — golds, mints, yellows. White on those is invisible on screen
 * and worse in print. Rather than forbid pale colours, which would mean telling
 * an agency its own logo is not allowed, the ink follows the colour.
 *
 * The two candidates are measured rather than split at a threshold. A hardcoded
 * cutoff has to be the exact crossover point or it hands back the worse of the
 * two inks for a band of colours either side of it — which is what a plausible
 * looking 0.5 did here, since the real crossover is nearer 0.2. Comparing the
 * ratios cannot be off by a band, and says plainly what it is choosing on.
 */
export function readableOn(hex: string): string {
  const background = luminance(hex);
  return contrast(background, luminance(DARK_INK)) >= contrast(background, luminance(LIGHT_INK))
    ? DARK_INK
    : LIGHT_INK;
}

/**
 * The brand colour darkened until it can be read as text on white paper.
 *
 * `readableOn` solves the opposite problem — ink on top of the accent — and
 * says nothing about the accent used *as* ink, which is the more common way a
 * brand colour appears on a document: a heading, a label, a total. A pale
 * yellow that is perfectly good as a rule across the top of a page is close to
 * invisible as words on white, and the agency that chose it will not discover
 * that until a customer says they cannot read the quotation.
 *
 * The hue is kept and the lightness given up, by scaling towards black until
 * the ratio clears the 4.5:1 floor. That keeps a yellow recognisably yellow —
 * darker, but theirs — instead of substituting a colour they never picked or,
 * worse, printing something nobody can read. Dark brand colours are already
 * past the floor and come back untouched.
 */
export function onPaper(hex: string): string {
  const value = normalizeHex(hex) ?? DEFAULT_BRAND_COLOR;
  const channels = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  const white = luminance("#ffffff");

  // Whole percents are finer than the eye can follow and bound the loop at 100
  // steps; the last one is black, which always clears the floor.
  for (let scale = 100; scale >= 0; scale -= 1) {
    const scaled = channels.map((c) => Math.round((c * scale) / 100));
    const candidate = `#${scaled.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    if (contrast(white, luminance(candidate)) >= 4.5) return candidate;
  }
  return DARK_INK;
}

/**
 * Where the mark is actually fetched from.
 *
 * An uploaded logo is served by the API, so the URL has to be absolute against
 * the API's origin — the agent portal is a different host, and a relative path
 * there resolves to a front end with no routes on it. That is the same mistake
 * that made destination autocomplete return nothing on the separated portal,
 * and it is worth naming twice: anything the browser fetches goes through
 * `apiUrl`.
 *
 * The upload timestamp rides along so a replaced logo is a different URL, which
 * is what lets the response be cached for a year.
 */
function logoFor(agencyId: string, profile: AgencyProfile): string | undefined {
  if (profile.logoUploadedAt) {
    return apiUrl(
      `/api/agency/logo/${encodeURIComponent(agencyId)}?v=${encodeURIComponent(profile.logoUploadedAt)}`,
    );
  }
  return profile.logoUrl || undefined;
}

/** Everything a document needs, from the account and its profile. */
export function brandingOf(
  agency: { id: string; name: string; profile: AgencyProfile } | Agency,
): Branding {
  const profile = agency.profile;
  const color = normalizeHex(profile.brandColor) ?? DEFAULT_BRAND_COLOR;
  return {
    name: profile.legalName?.trim() || agency.name,
    logoUrl: logoFor(agency.id, profile),
    address: profile.address || undefined,
    city: profile.city || undefined,
    email: profile.email || undefined,
    phone: profile.phone || undefined,
    website: profile.website || undefined,
    taxNumber: profile.taxNumber || undefined,
    footer: profile.documentFooter || undefined,
    color,
    onColor: readableOn(color),
    ink: onPaper(color),
  };
}

/** The contact line under the name — the parts that exist, in reading order. */
export function contactLine(branding: Branding): string {
  return [branding.phone, branding.email, branding.website].filter(Boolean).join(" · ");
}
