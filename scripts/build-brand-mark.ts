/**
 * Draws the Travel & More globe.
 *
 *   npx tsx scripts/build-brand-mark.ts
 *
 * The mark is a sphere built from square tiles that break away toward the upper
 * right. Hand-authoring sixty rounded rectangles on a sphere is not a thing
 * anyone should do twice, so the geometry is generated: each tile is placed by
 * latitude and longitude, projected orthographically, and foreshortened by how
 * far around the sphere it sits. That is also why it looks like a globe rather
 * than a grid — the tiles shrink and lean as they turn away from the viewer.
 *
 * Output is a static file. Nothing regenerates it at build or run time, so the
 * logo cannot change shape because a rounding rule changed.
 */
import fs from "node:fs";
import path from "node:path";

const SIZE = 200;
const R = 88;
const CX = 100;
const CY = 100;

/** Deep to pale, so tiles can be tinted by depth rather than at random. */
const TINTS = ["#d1500a", "#e35c10", "#f26a21", "#f7863f", "#fb9a5c", "#fdb184", "#fec9a8"];

/** FNV-1a, so the same tile always gets the same tint across regenerations. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Tile {
  x: number;
  y: number;
  size: number;
  rotate: number;
  fill: string;
  opacity: number;
}

/**
 * Bands of latitude, each with its own tile count.
 *
 * Fewer tiles near the poles: spacing them evenly in longitude would crowd them
 * into a solid cap, which reads as a blob rather than a sphere.
 */
const BANDS: { lat: number; count: number }[] = [
  { lat: -62, count: 5 },
  { lat: -44, count: 8 },
  { lat: -26, count: 10 },
  { lat: -8, count: 11 },
  { lat: 10, count: 11 },
  { lat: 28, count: 10 },
  { lat: 46, count: 8 },
  { lat: 64, count: 5 },
];

const rad = (deg: number) => (deg * Math.PI) / 180;

function sphereTiles(): Tile[] {
  const tiles: Tile[] = [];

  for (const band of BANDS) {
    const lat = rad(band.lat);
    const ringRadius = Math.cos(lat);

    for (let i = 0; i < band.count; i += 1) {
      // Longitudes span rather more than the visible half, so the edge tiles
      // are cut off by the sphere instead of stopping short of it.
      const lon = rad(-95 + (i / (band.count - 1)) * 190);
      const facing = Math.cos(lon) * Math.cos(lat);
      // Behind the horizon, or so close to it that the tile is a sliver.
      if (facing <= 0.12) continue;

      const x = CX + R * ringRadius * Math.sin(lon);
      const y = CY - R * Math.sin(lat);
      // Smaller than the spacing on purpose: the gaps between tiles are what
      // make this read as a mosaic globe rather than an orange ball, and at
      // header size they are the first thing to close up.
      const size = 21 * Math.min(1, 0.45 + facing * 0.75);

      // Tinted by horizontal position, not by depth. The artwork is lit from
      // the upper right — deep orange on the left shoulder, pale toward the
      // side the tiles fly off. Keying on depth instead put the darkest tile
      // dead centre, which flattened the sphere into a disc.
      const key = `${band.lat}:${i}`;
      const across = (x - (CX - R)) / (2 * R);
      const lift = (CY - y) / (2 * R);
      const shade = Math.round((across * 0.75 + lift * 0.45) * (TINTS.length - 1));
      const jitter = (hash(key) % 3) - 1;
      const fill = TINTS[Math.min(TINTS.length - 1, Math.max(0, shade + jitter))];

      tiles.push({
        x,
        y,
        size,
        // Tiles follow the surface, so they lean with the longitude they sit on.
        rotate: (lon * 180) / Math.PI * 0.35 + (band.lat > 0 ? -4 : 4),
        fill,
        opacity: 1,
      });
    }
  }

  return tiles;
}

/**
 * The tiles that have left the sphere.
 *
 * They carry the movement in the logo: same shapes, thrown up and to the right,
 * getting smaller and paler as they go. Positions are hand-placed rather than
 * generated — a scatter that reads as deliberate needs an eye, not a formula.
 */
const DISPERSED: { x: number; y: number; size: number; rotate: number; tint: number; opacity: number }[] = [
  { x: 172, y: 44, size: 20, rotate: -12, tint: 2, opacity: 1 },
  { x: 196, y: 26, size: 15, rotate: -18, tint: 3, opacity: 0.95 },
  { x: 214, y: 52, size: 12, rotate: 8, tint: 4, opacity: 0.9 },
  { x: 186, y: 76, size: 17, rotate: -6, tint: 3, opacity: 1 },
  { x: 210, y: 96, size: 13, rotate: 12, tint: 5, opacity: 0.85 },
  { x: 232, y: 34, size: 9, rotate: -22, tint: 5, opacity: 0.75 },
  { x: 196, y: 124, size: 11, rotate: 16, tint: 4, opacity: 0.8 },
  { x: 224, y: 140, size: 8, rotate: 22, tint: 6, opacity: 0.7 },
];

/**
 * The same geometry as data.
 *
 * The React component reads this rather than the SVG file so the mark can be
 * recoloured and sized without a second network request — and because two
 * hand-kept copies of a logo drift. One generator writes both.
 */
function tileData(tile: Tile): string {
  const half = tile.size / 2;
  const parts = [
    `x: ${(tile.x - half).toFixed(2)}`,
    `y: ${(tile.y - half).toFixed(2)}`,
    `w: ${tile.size.toFixed(2)}`,
    `r: ${(tile.size * 0.22).toFixed(2)}`,
    `f: "${tile.fill}"`,
    `o: ${tile.opacity}`,
    `t: "rotate(${tile.rotate.toFixed(1)} ${tile.x.toFixed(2)} ${tile.y.toFixed(2)})"`,
  ];
  return `  { ${parts.join(", ")} },`;
}

function tileMarkup(tile: Tile): string {
  const half = tile.size / 2;
  return (
    `<rect x="${(tile.x - half).toFixed(2)}" y="${(tile.y - half).toFixed(2)}" ` +
    `width="${tile.size.toFixed(2)}" height="${tile.size.toFixed(2)}" rx="${(tile.size * 0.22).toFixed(2)}" ` +
    `fill="${tile.fill}"${tile.opacity < 1 ? ` opacity="${tile.opacity}"` : ""} ` +
    `transform="rotate(${tile.rotate.toFixed(1)} ${tile.x.toFixed(2)} ${tile.y.toFixed(2)})"/>`
  );
}

function build(): string {
  const body = [
    ...sphereTiles().map(tileMarkup),
    ...DISPERSED.map((tile) =>
      tileMarkup({
        x: tile.x,
        y: tile.y,
        size: tile.size,
        rotate: tile.rotate,
        fill: TINTS[tile.tint],
        opacity: tile.opacity,
      }),
    ),
  ].join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 248 200" role="img" aria-hidden="true">
  ${body}
</svg>
`;
}

function allTiles(): Tile[] {
  return [
    ...sphereTiles(),
    ...DISPERSED.map((tile) => ({
      x: tile.x,
      y: tile.y,
      size: tile.size,
      rotate: tile.rotate,
      fill: TINTS[tile.tint],
      opacity: tile.opacity,
    })),
  ];
}

function buildModule(): string {
  return `/**
 * Generated by \`scripts/build-brand-mark.ts\`. Do not edit by hand.
 *
 * The Travel & More globe, as tile geometry. Regenerate with:
 *
 *   npx tsx scripts/build-brand-mark.ts
 */

export interface GlobeTile {
  x: number;
  y: number;
  /** Tiles are square, so one dimension does for both. */
  w: number;
  r: number;
  f: string;
  o: number;
  t: string;
}

export const GLOBE_TILES: GlobeTile[] = [
${allTiles().map(tileData).join("\n")}
];
`;
}

const svgOut = path.join(process.cwd(), "public", "brand", "globe.svg");
fs.mkdirSync(path.dirname(svgOut), { recursive: true });
fs.writeFileSync(svgOut, build(), "utf8");

const moduleOut = path.join(process.cwd(), "components", "ui", "globe-tiles.ts");
fs.writeFileSync(moduleOut, buildModule(), "utf8");

console.log(`Wrote ${svgOut}`);
console.log(`Wrote ${moduleOut}`);
