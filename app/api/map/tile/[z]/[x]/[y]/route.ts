/**
 * Map tiles, served by us rather than by the tile host.
 *
 * The alternative is putting the tile host's URL straight into an `<img>`,
 * which is simpler and tells that host the IP address of every visitor who
 * looks at a hotel, along with the tile numbers that say which hotel. This
 * codebase already self-hosts its fonts for exactly that reason; a map is a
 * hundred requests per page rather than two, so it matters more, not less.
 *
 * Proxying also means one place to put the cache headers, one place to
 * identify ourselves as the tile policy requires, and one place to change when
 * an operator moves to a paid provider.
 *
 * `MAP_TILE_URL` overrides the source. OpenStreetMap's own tiles are the
 * default because they need no key and make the map work out of the box, but
 * their policy is explicit that heavy or commercial use should not point here
 * — a production deployment sets this to its own provider.
 */

const DEFAULT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** A week. Tiles change on the order of months, and a stale road is no harm. */
const CACHE = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await ctx.params;

  /*
   * Bounds-checked before anything is fetched.
   *
   * Without this the route is an open image proxy: any path at all would be
   * pasted into the template and requested from our server, with our address
   * on it. The zoom ceiling is the deepest the tile host publishes.
   */
  const zoom = Number(z);
  const col = Number(x);
  const row = Number(y);
  const limit = 2 ** zoom;

  const valid =
    Number.isInteger(zoom) &&
    zoom >= 0 &&
    zoom <= 19 &&
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    col < limit &&
    row >= 0 &&
    row < limit;

  if (!valid) return new Response("Not a tile", { status: 400 });

  const template = process.env.MAP_TILE_URL ?? DEFAULT_TILES;
  const url = template
    .replace("{z}", String(zoom))
    .replace("{x}", String(col))
    .replace("{y}", String(row));

  try {
    const upstream = await fetch(url, {
      headers: {
        // Their policy asks for an identifying agent, and an unidentified
        // client is the one they block first.
        "User-Agent": process.env.MAP_TILE_USER_AGENT ?? "TravelAndMore/1.0 (+hotel booking platform)",
        Accept: "image/png,image/*",
      },
      signal: AbortSignal.timeout(8000),
      cache: "force-cache",
    });

    if (!upstream.ok) {
      // A missing tile is a hole in the map, not a broken page: the component
      // draws its own grid underneath and the rest of the tiles still show.
      return new Response("Tile unavailable", { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/png",
        "cache-control": CACHE,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Tile unavailable", { status: 502 });
  }
}
