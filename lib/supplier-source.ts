/**
 * Which wholesaler a result came from — for the test phase only.
 *
 * §9.4 keeps supplier identity off consumer and trade responses, because
 * neither audience is party to our supply arrangements, and the operator
 * console's availability probe is the one documented exception. This is a
 * second, deliberately temporary one: during acceptance testing the client
 * wants to see which provider each property came from so the two catalogues
 * can be checked against each other.
 *
 * Two things make it safe to have in the tree:
 *
 * It exposes nothing new. The canonical slug has always carried the source in
 * its prefix — it is how the console's probe attributes results without any
 * extra plumbing — so this reads a value already in every response rather than
 * adding one to the payload. Turning the flag off removes a badge; it does not
 * close a leak, because none was opened.
 *
 * And it is off unless something switches it on. The revert is deleting an
 * environment variable, not finding the commented-out code and remembering
 * which parts to restore — which is the version of "temporary" that survives
 * until somebody reads it in production a year later.
 */

export type SupplierSource = "hotelbeds" | "tourmind" | "platform";

/**
 * The source, from the slug the adapters mint.
 *
 * `platform` is the seeded demonstration catalogue rather than a wholesaler,
 * and saying so is the point: a tester comparing coverage needs to know when a
 * property came from neither supplier.
 */
export function supplierOf(slug: string): SupplierSource {
  if (slug.startsWith("hb-")) return "hotelbeds";
  if (slug.startsWith("tm-")) return "tourmind";
  return "platform";
}

/** What a tester should see. Never localised — these are proper nouns. */
export const SUPPLIER_LABEL: Record<SupplierSource, string> = {
  hotelbeds: "Hotelbeds",
  tourmind: "TourMind",
  platform: "Platform",
};

/**
 * Whether to show it at all.
 *
 * Read through `=== "1"` rather than truthiness so that setting the variable to
 * "0" or "false" — which is what someone reaches for when turning a thing off —
 * does not leave it on.
 */
export function showSupplierSource(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_SUPPLIER?.trim() === "1";
}
