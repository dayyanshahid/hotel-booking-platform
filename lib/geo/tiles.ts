/**
 * Web Mercator, enough of it to place a hotel on a map.
 *
 * A slippy map is a grid of 256-pixel images addressed by zoom, column and
 * row, and everything hard about drawing one is this projection. Kept as pure
 * arithmetic in its own module so it can be checked against known coordinates
 * rather than by looking at a picture and deciding it seems about right.
 */

export const TILE_SIZE = 256;

/** The furthest north and south Web Mercator can describe. */
export const MERCATOR_LIMIT = 85.0511287798;

export interface TilePoint {
  /** Fractional tile column — the whole part is the tile, the rest is where in it. */
  x: number;
  y: number;
}

function clampLat(lat: number): number {
  return Math.min(MERCATOR_LIMIT, Math.max(-MERCATOR_LIMIT, lat));
}

/**
 * Where a coordinate falls in tile space at a given zoom.
 *
 * Fractional on purpose: the integer part addresses the tile to fetch and the
 * fraction is how far into it the pin sits, which is the only way to place a
 * marker exactly rather than at the corner of the tile containing it.
 */
export function project(lat: number, lng: number, zoom: number): TilePoint {
  const n = 2 ** zoom;
  const latRad = (clampLat(lat) * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    // asinh(tan φ) is the Mercator y, and the identity every implementation of
    // this uses; the longer log(tan + sec) form is the same number.
    y: ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n,
  };
}

/** The inverse, for reading a click back into a place. */
export function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = 2 ** zoom;
  return {
    lng: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  };
}

export interface TileGrid {
  zoom: number;
  /** Column and row of the top-left tile. */
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  /** Where the subject sits inside the rendered grid, in pixels from its corner. */
  pin: { x: number; y: number };
  tiles: { z: number; x: number; y: number; left: number; top: number }[];
}

/**
 * The tiles needed to show a point, and where the pin goes on top of them.
 *
 * Odd counts, so the subject's own tile is the middle one and the pin lands
 * near the centre whatever the fraction happens to be. Tiles outside the
 * world at this zoom are dropped rather than requested — the grid simply has a
 * gap at the poles, which is where nobody has a hotel.
 */
export function tileGrid(
  lat: number,
  lng: number,
  zoom: number,
  cols = 3,
  rows = 3,
): TileGrid {
  const point = project(lat, lng, zoom);
  const max = 2 ** zoom;

  const centreX = Math.floor(point.x);
  const centreY = Math.floor(point.y);
  const originX = centreX - Math.floor(cols / 2);
  const originY = centreY - Math.floor(rows / 2);

  const tiles: TileGrid["tiles"] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const y = originY + row;
      // Rows off the top or bottom of the world do not exist; columns wrap,
      // because longitude does.
      if (y < 0 || y >= max) continue;
      const x = ((originX + col) % max + max) % max;
      tiles.push({ z: zoom, x, y, left: col * TILE_SIZE, top: row * TILE_SIZE });
    }
  }

  return {
    zoom,
    originX,
    originY,
    cols,
    rows,
    pin: {
      x: (point.x - originX) * TILE_SIZE,
      y: (point.y - originY) * TILE_SIZE,
    },
    tiles,
  };
}

/**
 * How many metres one pixel covers, for a scale bar.
 *
 * Shrinks with latitude, which is why a scale drawn at the equator is wrong in
 * Reykjavik.
 */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((clampLat(lat) * Math.PI) / 180)) / 2 ** zoom;
}
