import { localeFrom, ok } from "@/lib/server/api";
import { COLLECTIONS, PROPERTY_TYPES, PROPERTY_TYPE_KEYS, localized } from "@/lib/data/catalog";
import { collectionPhoto, PHOTO_SHAPE } from "@/lib/data/photos";

/**
 * GET /api/collections — the editorial groupings and the property vocabulary.
 *
 * Two things a shop front renders and neither belongs in a client bundle: the
 * collections are copy somebody wrote, and the property types are the words
 * this platform uses for what a place is. A front end that hard-coded either
 * would be a second copy of the catalogue, out of date the first time one was
 * edited.
 */
export async function GET(req: Request) {
  const locale = localeFrom(req);
  return ok({
    collections: COLLECTIONS.map((c) => ({
      slug: c.slug,
      title: localized(c.title, locale),
      body: localized(c.body, locale),
      tag: c.tag,
      accent: c.accent,
      photo: collectionPhoto(c.slug, c.tag, { shape: PHOTO_SHAPE.card }),
    })),
    propertyTypes: PROPERTY_TYPE_KEYS.map((key) => ({
      key,
      label: localized(PROPERTY_TYPES[key], locale),
    })),
  });
}
