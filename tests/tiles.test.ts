import { describe, expect, it } from "vitest";
import {
  TILE_SIZE,
  clusterByDistance,
  fromScreen,
  metresPerPixel,
  project,
  tileGrid,
  toScreen,
  unproject,
  viewport,
  viewportTiles,
  zoomToFit,
} from "@/lib/geo/tiles";

/**
 * The projection, against coordinates whose tile numbers are known.
 *
 * A map that is subtly wrong looks entirely fine — the pin sits on a street,
 * just not the right one — so this is checked arithmetically rather than by
 * looking at it. The reference values are the ones the OpenStreetMap wiki
 * documents for its own slippy map naming scheme.
 */

describe("web mercator", () => {
  it("puts 0,0 at the centre of the world", () => {
    const point = project(0, 0, 1);
    expect(point.x).toBeCloseTo(1, 6);
    expect(point.y).toBeCloseTo(1, 6);
  });

  it("agrees with the documented tile for a known place", () => {
    // Berlin at zoom 12 is tile 2200/1343 — the worked example in the OSM
    // slippy-map documentation.
    const point = project(52.517, 13.3888, 12);
    expect(Math.floor(point.x)).toBe(2200);
    expect(Math.floor(point.y)).toBe(1343);
  });

  it("round-trips a coordinate through tile space", () => {
    for (const [lat, lng] of [
      [25.2505, 55.2988], // Dubai
      [-33.8688, 151.2093], // Sydney, southern and eastern
      [64.1466, -21.9426], // Reykjavik, far north
      [0, 0],
    ]) {
      const zoom = 14;
      const point = project(lat, lng, zoom);
      const back = unproject(point.x, point.y, zoom);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lng).toBeCloseTo(lng, 6);
    }
  });

  it("clamps past the poles rather than returning infinity", () => {
    // tan(90°) is unbounded, and an unclamped projection returns NaN or
    // Infinity here — which reaches the DOM as a pin at `top: NaNpx`.
    for (const lat of [90, -90, 89.9999]) {
      const point = project(lat, 0, 10);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});

describe("the grid a map is drawn from", () => {
  it("centres the subject's own tile", () => {
    const grid = tileGrid(25.2505, 55.2988, 15, 3, 3);
    const centre = project(25.2505, 55.2988, 15);
    expect(grid.originX).toBe(Math.floor(centre.x) - 1);
    expect(grid.originY).toBe(Math.floor(centre.y) - 1);
    expect(grid.tiles).toHaveLength(9);
  });

  it("places the pin inside the middle tile", () => {
    /*
     * The whole point of a fractional projection. The pin belongs at the
     * property, not at the corner of the tile the property happens to be in —
     * at zoom 15 that corner can be six hundred metres away.
     */
    const grid = tileGrid(25.2505, 55.2988, 15, 3, 3);
    expect(grid.pin.x).toBeGreaterThan(256);
    expect(grid.pin.x).toBeLessThan(512);
    expect(grid.pin.y).toBeGreaterThan(256);
    expect(grid.pin.y).toBeLessThan(512);
  });

  it("asks for no tile that does not exist", () => {
    // Near the pole the rows above run off the top of the world. They are
    // dropped, not requested as a negative row that would 404 nine times.
    const grid = tileGrid(84.9, 0, 4, 3, 3);
    const max = 2 ** 4;
    for (const tile of grid.tiles) {
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(max);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(max);
    }
  });

  it("wraps columns across the date line", () => {
    // Longitude wraps and latitude does not, so a property at 179.9°E needs
    // tiles from the far side of the world beside it.
    const grid = tileGrid(0, 179.99, 6, 3, 3);
    const max = 2 ** 6;
    for (const tile of grid.tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(max);
    }
    expect(new Set(grid.tiles.map((tile) => tile.x)).size).toBe(3);
  });
});

describe("scale", () => {
  it("shrinks towards the poles", () => {
    // One pixel covers less ground in Reykjavik than in Dubai at the same
    // zoom, which is why a scale bar has to be computed per property.
    const equator = metresPerPixel(0, 15);
    const dubai = metresPerPixel(25.25, 15);
    const reykjavik = metresPerPixel(64.15, 15);
    expect(dubai).toBeLessThan(equator);
    expect(reykjavik).toBeLessThan(dubai);
    // Sanity: a zoom-15 pixel is a few metres, not a few kilometres.
    expect(equator).toBeGreaterThan(4);
    expect(equator).toBeLessThan(6);
  });
});

describe("a viewport that pans", () => {
  const W = 800;
  const H = 560;

  it("puts the centre in the centre", () => {
    const view = viewport(25.2505, 55.2988, 14, W, H);
    const screen = toScreen(view, 25.2505, 55.2988);
    expect(screen.x).toBeCloseTo(W / 2, 6);
    expect(screen.y).toBeCloseTo(H / 2, 6);
  });

  it("round-trips a screen position back to a place", () => {
    // This is what "search this area" depends on: the viewport's own corners
    // read back as the bounds to search.
    const view = viewport(25.2505, 55.2988, 13, W, H);
    for (const [x, y] of [[0, 0], [W, H], [W / 3, H / 4]]) {
      const place = fromScreen(view, x, y);
      const back = toScreen(view, place.lat, place.lng);
      expect(back.x).toBeCloseTo(x, 4);
      expect(back.y).toBeCloseTo(y, 4);
    }
  });

  it("covers the whole viewport with tiles", () => {
    const view = viewport(25.2505, 55.2988, 14, W, H);
    const tiles = viewportTiles(view, 0);
    const left = Math.min(...tiles.map((tile) => tile.left));
    const top = Math.min(...tiles.map((tile) => tile.top));
    const right = Math.max(...tiles.map((tile) => tile.left + TILE_SIZE));
    const bottom = Math.max(...tiles.map((tile) => tile.top + TILE_SIZE));
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(W);
    expect(bottom).toBeGreaterThanOrEqual(H);
  });

  it("asks for no tile off the edge of the world", () => {
    const view = viewport(84.5, 179.9, 5, W, H);
    const max = 2 ** 5;
    for (const tile of viewportTiles(view)) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(max);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(max);
    }
  });
});

describe("clustering so the labels can be read", () => {
  const SEP = 104;

  it("leaves every drawn pin clear of every other", () => {
    /*
     * The property this exists for. Grid bucketing satisfies "same cell →
     * same group" while still drawing two pins a pixel apart, which is what
     * put a price pill over the one behind it in central Dubai.
     */
    const points = [
      { x: 100, y: 100 }, { x: 104, y: 101 }, { x: 150, y: 130 },
      { x: 220, y: 118 }, { x: 400, y: 400 }, { x: 402, y: 404 },
      { x: 500, y: 402 }, { x: 96, y: 96 }, { x: 300, y: 250 },
    ];
    const anchors = clusterByDistance(points, SEP).map((group) => group[0]);
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const gap = Math.hypot(anchors[i].x - anchors[j].x, anchors[i].y - anchors[j].y);
        expect(gap).toBeGreaterThanOrEqual(SEP);
      }
    }
  });

  it("loses nobody into the gaps between groups", () => {
    // Every property is either drawn or counted in something that is drawn.
    const points = Array.from({ length: 68 }, (_, i) => ({ x: (i * 37) % 800, y: (i * 61) % 560 }));
    const groups = clusterByDistance(points, SEP);
    expect(groups.flat()).toHaveLength(points.length);
    expect(new Set(groups.flat())).toHaveProperty("size", points.length);
  });

  it("keeps the first point as the anchor, so the caller decides who shows", () => {
    // The map sorts cheapest-first and draws group[0]; a cluster must therefore
    // surface the lowest rate rather than whichever point happened to be near.
    const cheapest = { x: 200, y: 200, tag: "cheapest" };
    const groups = clusterByDistance(
      [cheapest, { x: 210, y: 205, tag: "dearer" }, { x: 195, y: 215, tag: "dearest" }],
      SEP,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe(cheapest);
    expect(groups[0]).toHaveLength(3);
  });

  it("separates points that are exactly the separation apart", () => {
    // A pin at precisely the clearance does not collide, so it stays its own.
    expect(clusterByDistance([{ x: 0, y: 0 }, { x: SEP, y: 0 }], SEP)).toHaveLength(2);
    expect(clusterByDistance([{ x: 0, y: 0 }, { x: SEP - 1, y: 0 }], SEP)).toHaveLength(1);
  });

  it("has nothing to do with an empty map", () => {
    expect(clusterByDistance([], SEP)).toEqual([]);
  });
});

describe("fitting the results", () => {
  const W = 800;
  const H = 560;

  it("shows every property, with room to spare", () => {
    /*
     * Opening at a fixed zoom either crops half the city or shows a continent
     * with the pins in a dot in the middle. Every point has to land inside the
     * frame, clear of the edge where a price pill would be cut off.
     */
    const points = [
      { lat: 25.2048, lng: 55.2708 },
      { lat: 25.1972, lng: 55.2744 },
      { lat: 25.2769, lng: 55.2963 },
      { lat: 25.1124, lng: 55.1390 },
    ];
    const fit = zoomToFit(points, W, H);
    const view = viewport(fit.lat, fit.lng, fit.zoom, W, H);
    for (const point of points) {
      const screen = toScreen(view, point.lat, point.lng);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(W);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(H);
    }
  });

  it("does not zoom to the atom for a single property", () => {
    // One point fits at any zoom, so "the deepest that fits" would be the
    // deepest there is — a map of one building's roof.
    const fit = zoomToFit([{ lat: 25.2505, lng: 55.2988 }], W, H);
    expect(fit.zoom).toBeLessThanOrEqual(15);
    expect(fit.zoom).toBeGreaterThanOrEqual(12);
  });

  it("survives having nothing to fit", () => {
    expect(() => zoomToFit([], W, H)).not.toThrow();
  });
});
