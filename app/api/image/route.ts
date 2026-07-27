import { hash01 } from "@/lib/server/pricing";

/**
 * Deterministic, self-contained property imagery.
 *
 * Real deployments serve licensed supplier content through a CDN with
 * srcset/AVIF transformation (§12.2). This route stands in for that pipeline so
 * the prototype renders stable, correctly-sized images with no external
 * dependency and no layout shift.
 */

const PALETTES: Record<string, [string, string, string]> = {
  exterior: ["#0f2f4a", "#1d6a8f", "#f4c78a"],
  lobby: ["#2a1f38", "#6b4c7a", "#e9d8c3"],
  room: ["#1e3040", "#4f7b8f", "#f0e2cf"],
  dining: ["#3a1f1c", "#8a4b34", "#f2cfa8"],
  pool: ["#06323f", "#2196a8", "#d9f2f0"],
  view: ["#141c3a", "#3b5ea8", "#ffcf8d"],
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const seed = url.searchParams.get("seed") ?? "default";
  const kind = url.searchParams.get("kind") ?? "exterior";
  const palette = PALETTES[kind] ?? PALETTES.exterior;
  const r = hash01(seed);
  const r2 = hash01(`${seed}-b`);
  const angle = Math.round(r * 120) + 20;
  const w = 800;
  const h = 600;

  const buildings = Array.from({ length: 6 }, (_, i) => {
    const bw = 60 + Math.round(hash01(`${seed}-${i}`) * 90);
    const bh = 120 + Math.round(hash01(`${seed}-h-${i}`) * 300);
    const x = i * 135 + Math.round(hash01(`${seed}-x-${i}`) * 20);
    return `<rect x="${x}" y="${h - bh - 90}" width="${bw}" height="${bh}" fill="${palette[0]}" opacity="${0.35 + hash01(`${seed}-o-${i}`) * 0.4}" rx="4"/>`;
  }).join("");

  const windows = Array.from({ length: 28 }, (_, i) => {
    const x = 30 + ((i * 97) % (w - 60));
    const y = 120 + ((i * 63) % (h - 260));
    return `<rect x="${x}" y="${y}" width="10" height="14" fill="${palette[2]}" opacity="${0.25 + hash01(`${seed}-w-${i}`) * 0.5}" rx="2"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${palette[0]}"/>
      <stop offset="55%" stop-color="${palette[1]}"/>
      <stop offset="100%" stop-color="${palette[2]}"/>
    </linearGradient>
    <radialGradient id="s" cx="${20 + r2 * 60}%" cy="22%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect width="${w}" height="${h}" fill="url(#s)"/>
  ${kind === "room" || kind === "lobby" || kind === "dining" ? windows : buildings}
  <rect y="${h - 90}" width="${w}" height="90" fill="${palette[0]}" opacity="0.55"/>
  <circle cx="${120 + r * 560}" cy="${90 + r2 * 60}" r="46" fill="#ffffff" opacity="0.22"/>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
