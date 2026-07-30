import "server-only";
import { driver } from "../server/persistence";

/**
 * An agency's logo, uploaded rather than linked.
 *
 * Asking for a URL assumes the agency has somewhere to host an image, and most
 * do not — the file is on somebody's desktop. So the bytes are taken and kept
 * here, in the same store everything else uses: the filesystem locally, Redis
 * on a deployment that has it. No blob service to provision, and the logo
 * survives a cold start exactly as far as the rest of the data does.
 *
 * Linking a URL still works and is still better when an agency has a CDN. This
 * is the other half, not a replacement.
 */

/**
 * What may be uploaded, matched on the bytes rather than the declared type.
 *
 * A browser's `Content-Type` is whatever the client says it is. That matters
 * more than usual because this image is served back from our own origin and
 * printed on a document a traveller is asked to trust: an SVG is a script that
 * happens to draw, and an SVG accepted as `image/png` would be stored ready to
 * run against our domain the moment anyone opened it. So SVG is refused
 * outright — a logo does not need it — and the other three are confirmed by
 * their signature before anything is written.
 */
const SIGNATURES: { type: string; magic: number[]; offset?: number }[] = [
  { type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  // RIFF....WEBP — the four size bytes in between are skipped.
  { type: "image/webp", magic: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

/**
 * A logo has to be small enough to print and to sit in a key-value store.
 *
 * Half a megabyte is generous for a mark that renders inside a 220-pixel box,
 * and stays well inside the value limit of the Redis tiers this runs on once
 * base64 has added a third.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/** The image type these bytes actually are, or null if they are not an image. */
export function sniffImageType(bytes: Uint8Array): string | null {
  for (const { type, magic, offset = 0 } of SIGNATURES) {
    if (bytes.length < offset + magic.length) continue;
    if (magic.every((byte, i) => bytes[offset + i] === byte)) return type;
  }
  return null;
}

/** One document per agency, so a logo is never read alongside a credit line. */
function key(agencyId: string): string {
  // The store rejects anything outside `[a-z0-9-]`, and agency ids carry an
  // underscore. Folded rather than passed through, so a new id format cannot
  // turn into a write that throws in production.
  return `agency-logo-${agencyId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export interface StoredLogo {
  contentType: string;
  /** base64, because the store holds JSON documents. */
  data: string;
  updatedAt: string;
}

export async function saveLogo(
  agencyId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<StoredLogo> {
  const stored: StoredLogo = {
    contentType,
    data: Buffer.from(bytes).toString("base64"),
    updatedAt: new Date().toISOString(),
  };
  await driver().write(key(agencyId), stored);
  return stored;
}

export async function getLogo(agencyId: string): Promise<StoredLogo | null> {
  const stored = await driver().read<StoredLogo>(key(agencyId));
  if (!stored?.data || !stored.contentType) return null;
  return stored;
}

/**
 * Removing a logo writes an empty document rather than deleting one.
 *
 * The driver has no delete, and an agency that has cleared its logo must not
 * fall back to the one it just removed — which is what a missing document
 * would mean if a stale copy were still cached anywhere.
 */
export async function clearLogo(agencyId: string): Promise<void> {
  await driver().write(key(agencyId), { contentType: "", data: "", updatedAt: new Date().toISOString() });
}
