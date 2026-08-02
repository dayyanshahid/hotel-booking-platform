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

/* ------------------------------------------------------ a panning viewport */

export interface Viewport {
  zoom: number;
  /** Pixel position of the map centre in the whole-world pixel plane. */
  centre: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * The world in pixels at a zoom, for a map that pans rather than sits still.
 *
 * The inset on a property page needs nine tiles round a point and nothing
 * else. A results map is a viewport onto the same plane: it has a size, it
 * moves, and which tiles it needs falls out of where its edges land. Both are
 * the same projection, so both live here.
 */
export function viewport(lat: number, lng: number, zoom: number, width: number, height: number): Viewport {
  const point = project(lat, lng, zoom);
  return { zoom, centre: { x: point.x * TILE_SIZE, y: point.y * TILE_SIZE }, width, height };
}

/** Where a coordinate lands on screen, in pixels from the viewport's corner. */
export function toScreen(view: Viewport, lat: number, lng: number): { x: number; y: number } {
  const point = project(lat, lng, view.zoom);
  return {
    x: point.x * TILE_SIZE - view.centre.x + view.width / 2,
    y: point.y * TILE_SIZE - view.centre.y + view.height / 2,
  };
}

/** And the reverse, for turning a drag or a viewport edge back into a place. */
export function fromScreen(view: Viewport, x: number, y: number): { lat: number; lng: number } {
  return unproject(
    (view.centre.x + x - view.width / 2) / TILE_SIZE,
    (view.centre.y + y - view.height / 2) / TILE_SIZE,
    view.zoom,
  );
}

/**
 * Every tile the viewport touches, positioned for absolute layout.
 *
 * One row and column of overhang, so a drag reveals map rather than blank —
 * the tiles are already there by the time the pointer moves.
 */
export function viewportTiles(view: Viewport, overhang = 1): TileGrid["tiles"] {
  const max = 2 ** view.zoom;
  const left = view.centre.x - view.width / 2;
  const top = view.centre.y - view.height / 2;

  const firstCol = Math.floor(left / TILE_SIZE) - overhang;
  const lastCol = Math.floor((left + view.width) / TILE_SIZE) + overhang;
  const firstRow = Math.floor(top / TILE_SIZE) - overhang;
  const lastRow = Math.floor((top + view.height) / TILE_SIZE) + overhang;

  const tiles: TileGrid["tiles"] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    // Latitude does not wrap; rows past the poles simply are not there.
    if (row < 0 || row >= max) continue;
    for (let col = firstCol; col <= lastCol; col++) {
      tiles.push({
        z: view.zoom,
        // Longitude does wrap, so the column is taken modulo the world while
        // its screen position keeps the un-wrapped value.
        x: ((col % max) + max) % max,
        y: row,
        left: col * TILE_SIZE - left,
        top: row * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

/**
 * Group screen points so no two survivors are drawn on top of each other.
 *
 * Greedy by distance, not by grid cell. Bucketing into cells is the obvious
 * way to cluster and it does not work for labels: two points either side of a
 * cell boundary land in different buckets and can be a pixel apart, which on a
 * results map draws one price pill straight over the one behind it — the
 * covered rate cannot be read and cannot be clicked. Claiming a radius as each
 * point is placed is what actually guarantees the gap.
 *
 * Order is the caller's: whatever comes first wins its spot and becomes the
 * group's anchor, so a caller that sorts by price keeps the cheapest visible
 * and folds the rest into its count.
 */
export function clusterByDistance<T extends { x: number; y: number }>(
  points: T[],
  separation: number,
): T[][] {
  const groups: T[][] = [];
  for (const point of points) {
    let nearest: T[] | null = null;
    let best = separation;
    for (const group of groups) {
      // Measured against the anchor, because the anchor is what gets drawn.
      const distance = Math.hypot(group[0].x - point.x, group[0].y - point.y);
      if (distance < best) {
        best = distance;
        nearest = group;
      }
    }
    if (nearest) nearest.push(point);
    else groups.push([point]);
  }
  return groups;
}

/**
 * The deepest zoom at which every point still fits the viewport.
 *
 * Opening a results map at a fixed zoom either crops half the city or shows a
 * continent with a cluster of pins in the middle of it. This is what "fit the
 * results" means arithmetically.
 */
export function zoomToFit(
  points: { lat: number; lng: number }[],
  width: number,
  height: number,
  { min = 2, max = 17, padding = 64 } = {},
): { lat: number; lng: number; zoom: number } {
  if (!points.length) return { lat: 0, lng: 0, zoom: min };

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const centre = {
    lat: (Math.max(...lats) + Math.min(...lats)) / 2,
    lng: (Math.max(...lngs) + Math.min(...lngs)) / 2,
  };
  if (points.length === 1) return { ...centre, zoom: 14 };

  for (let zoom = max; zoom >= min; zoom--) {
    const view = viewport(centre.lat, centre.lng, zoom, width, height);
    const fits = points.every((point) => {
      const screen = toScreen(view, point.lat, point.lng);
      return (
        screen.x >= padding &&
        screen.x <= width - padding &&
        screen.y >= padding &&
        screen.y <= height - padding
      );
    });
    if (fits) return { ...centre, zoom };
  }
  return { ...centre, zoom: min };
}
