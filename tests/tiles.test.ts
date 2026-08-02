import { describe, expect, it } from "vitest";
import { metresPerPixel, project, tileGrid, unproject } from "@/lib/geo/tiles";

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
