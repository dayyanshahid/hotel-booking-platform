import { hash01 } from "../hash";

/**
 * Deterministic scene illustrator.
 *
 * Stands in for the licensed photography pipeline described in §12.2. Every
 * scene is drawn from the seed alone, so a given hotel keeps the same imagery
 * across renders, deploys and locales — no layout shift, no broken image, no
 * external request and no licensing question.
 *
 * Scenes are composed in depth order (sky → distance → subject → foreground)
 * with one light source per palette, which is what stops them reading as
 * abstract gradients.
 */

export type SceneKind = "exterior" | "room" | "pool" | "dining" | "lobby" | "view" | "landmark";

export const SCENE_KINDS: SceneKind[] = ["exterior", "room", "pool", "dining", "lobby", "view", "landmark"];

/**
 * Bump when the artwork changes.
 *
 * Scenes are served with a one-year immutable cache, so without a version in
 * the URL a returning visitor would keep the old drawing forever. Every scene
 * URL is built through `sceneUrl`, which carries this token.
 */
export const SCENE_VERSION = 3;

export const SCENE_WIDTH = 800;
export const SCENE_HEIGHT = 600;

interface Palette {
  skyTop: string;
  skyBottom: string;
  sun: string;
  far: string;
  mid: string;
  near: string;
  accent: string;
  warmLight: string;
  ground: string;
  /**
   * Building silhouettes, always tonally separated from the sky. Reusing the
   * mid/near tones made night exteriors read as one muddy field.
   */
  silhouette: [string, string];
  /** Night scenes light their windows; day scenes reflect instead. */
  night: boolean;
}

/** Time-of-day palettes. The seed picks one, so a property keeps its mood. */
const PALETTES: Palette[] = [
  {
    // Warm dusk
    skyTop: "#20304f", skyBottom: "#f0a06a", sun: "#ffd9a0", far: "#4a5a7a",
    mid: "#2f3b57", near: "#1d2438", accent: "#f6c177", warmLight: "#ffd9a0",
    ground: "#161d2e", silhouette: ["#2a2f47", "#161a2b"], night: true,
  },
  {
    // Clear day
    skyTop: "#8fc4e8", skyBottom: "#e8f2f7", sun: "#fff6dd", far: "#b9cfdd",
    mid: "#8fa9bb", near: "#5e7d91", accent: "#1c8288", warmLight: "#ffffff",
    ground: "#dfe7ea", silhouette: ["#7f9cb0", "#54728a"], night: false,
  },
  {
    // Desert morning
    skyTop: "#a9c8dd", skyBottom: "#f5e2c4", sun: "#fff3d6", far: "#d8c4a4",
    mid: "#c2a683", near: "#9d8461", accent: "#c58530", warmLight: "#fff1d4",
    ground: "#e6d5b8", silhouette: ["#b08f66", "#7d6343"], night: false,
  },
  {
    // Deep night
    skyTop: "#0b1224", skyBottom: "#26365c", sun: "#e8eeff", far: "#1b2743",
    mid: "#141d33", near: "#0d1424", accent: "#6dbfc2", warmLight: "#ffd9a0",
    ground: "#0a0f1c", silhouette: ["#1d2740", "#101827"], night: true,
  },
  {
    // Sea afternoon
    skyTop: "#6fb2d6", skyBottom: "#dff0f4", sun: "#ffffff", far: "#a8cfdd",
    mid: "#3ba0a5", near: "#14676d", accent: "#1c8288", warmLight: "#ffffff",
    ground: "#cfe6ea", silhouette: ["#3d7d94", "#1f5a70"], night: false,
  },
];

function paletteFor(seed: string, kind: SceneKind): Palette {
  const index = Math.floor(hash01(`${seed}|palette`) * PALETTES.length) % PALETTES.length;
  const base = PALETTES[index];
  // Interiors are lit rather than skylit, so they never use the deep-night sky.
  const interior = kind === "room" || kind === "dining" || kind === "lobby";
  const chosen = interior && base.night ? PALETTES[2] : base;
  return chosen;
}

function rand(seed: string, salt: string, min: number, max: number): number {
  return min + hash01(`${seed}|${salt}`) * (max - min);
}

function pick<T>(seed: string, salt: string, options: T[]): T {
  return options[Math.floor(hash01(`${seed}|${salt}`) * options.length) % options.length];
}

/* ------------------------------------------------------------- primitives */

/** The sky gradient is defined once per scene, so this only paints it. */
function sky(): string {
  return `<rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" fill="url(#sky)"/>`;
}

function sunDisc(p: Palette, seed: string): string {
  const cx = rand(seed, "sunx", 120, 680);
  const cy = rand(seed, "suny", 80, 200);
  const r = p.night ? 28 : 46;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r * 3}" fill="url(#glow)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.sun}" opacity="${p.night ? 0.9 : 0.95}"/>`;
}

function stars(p: Palette, seed: string): string {
  if (!p.night) return "";
  return Array.from({ length: 40 }, (_, i) => {
    const x = rand(seed, `stx${i}`, 10, SCENE_WIDTH - 10);
    const y = rand(seed, `sty${i}`, 10, 260);
    const r = rand(seed, `str${i}`, 0.6, 1.8);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.3 + hash01(`${seed}|sto${i}`) * 0.6).toFixed(2)}"/>`;
  }).join("");
}

function birds(seed: string, p: Palette): string {
  if (p.night) return "";
  return Array.from({ length: 5 }, (_, i) => {
    const x = rand(seed, `bx${i}`, 80, 700);
    const y = rand(seed, `by${i}`, 70, 190);
    const s = rand(seed, `bs${i}`, 5, 10);
    return `<path d="M${x} ${y} q${s / 2} ${-s / 2} ${s} 0 q${s / 2} ${-s / 2} ${s} 0" stroke="${p.far}" stroke-width="1.6" fill="none" opacity="0.7"/>`;
  }).join("");
}

/** Palm trees — the signature foreground element for the launch markets. */
function palm(x: number, y: number, scale: number, colour: string): string {
  const fronds = Array.from({ length: 7 }, (_, i) => {
    const angle = -160 + i * 27;
    const rad = (angle * Math.PI) / 180;
    const len = 52 * scale;
    const ex = x + Math.cos(rad) * len;
    const ey = y + Math.sin(rad) * len * 0.75;
    const cx = x + Math.cos(rad) * len * 0.45;
    const cy = y + Math.sin(rad) * len * 0.45 - 16 * scale;
    return `<path d="M${x} ${y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="${colour}" stroke-width="${(4 * scale).toFixed(1)}" fill="none" stroke-linecap="round"/>`;
  }).join("");
  return `
    <path d="M${x} ${y} q${-5 * scale} ${45 * scale} ${-2 * scale} ${95 * scale}" stroke="${colour}" stroke-width="${(7 * scale).toFixed(1)}" fill="none" stroke-linecap="round"/>
    ${fronds}`;
}

function windowGrid(
  x: number, y: number, w: number, h: number, cols: number, rows: number,
  p: Palette, seed: string, salt: string,
): string {
  const gapX = w / cols;
  const gapY = h / rows;
  const cells: string[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const lit = hash01(`${seed}|${salt}|${c}|${r}`) > (p.night ? 0.42 : 0.75);
      const fill = p.night
        ? lit ? p.warmLight : "#0e1526"
        : lit ? "#ffffff" : p.far;
      const opacity = p.night ? (lit ? 0.92 : 0.55) : lit ? 0.5 : 0.35;
      cells.push(
        `<rect x="${(x + c * gapX + gapX * 0.22).toFixed(1)}" y="${(y + r * gapY + gapY * 0.22).toFixed(1)}" width="${(gapX * 0.56).toFixed(1)}" height="${(gapY * 0.5).toFixed(1)}" rx="1.5" fill="${fill}" opacity="${opacity}"/>`,
      );
    }
  }
  return cells.join("");
}

/* ----------------------------------------------------------------- scenes */

function exteriorScene(seed: string, p: Palette): string {
  const towers = Array.from({ length: 6 }, (_, i) => {
    const w = rand(seed, `tw${i}`, 70, 130);
    const h = rand(seed, `th${i}`, 150, 340);
    const x = 40 + i * 125 + rand(seed, `tx${i}`, -14, 14);
    const y = SCENE_HEIGHT - 150 - h;
    const depth = i % 2 === 0 ? p.silhouette[0] : p.silhouette[1];
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(h + 60).toFixed(1)}" rx="4" fill="${depth}"/>
      ${windowGrid(x, y + 18, w, h - 30, 3, Math.max(3, Math.round(h / 46)), p, seed, `tg${i}`)}`;
  }).join("");

  // The subject building: a lit entrance canopy reads as "hotel", not "office".
  const bx = 250, bw = 300, bh = 250;
  const by = SCENE_HEIGHT - 150 - bh;

  return `
    ${sky()}${stars(p, seed)}${sunDisc(p, seed)}${birds(seed, p)}
    <!-- horizon haze: gives the skyline an edge to sit against -->
    <rect x="0" y="${SCENE_HEIGHT - 250}" width="${SCENE_WIDTH}" height="120" fill="${p.sun}" opacity="${p.night ? 0.1 : 0.28}"/>
    ${towers}
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh + 60}" rx="6" fill="${p.silhouette[1]}"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="14" rx="4" fill="${p.accent}" opacity="0.85"/>
    ${windowGrid(bx + 12, by + 30, bw - 24, bh - 50, 5, 5, p, seed, "hero")}
    <rect x="${bx + 90}" y="${SCENE_HEIGHT - 150}" width="120" height="60" rx="3" fill="${p.warmLight}" opacity="${p.night ? 0.85 : 0.6}"/>
    <rect x="${bx + 60}" y="${SCENE_HEIGHT - 158}" width="180" height="10" rx="5" fill="${p.accent}"/>
    <rect x="0" y="${SCENE_HEIGHT - 90}" width="${SCENE_WIDTH}" height="90" fill="${p.ground}"/>
    <rect x="0" y="${SCENE_HEIGHT - 90}" width="${SCENE_WIDTH}" height="3" fill="${p.accent}" opacity="0.35"/>
    ${palm(120, SCENE_HEIGHT - 96, 1.15, p.night ? "#101a2c" : "#2f5d43")}
    ${palm(690, SCENE_HEIGHT - 96, 0.95, p.night ? "#101a2c" : "#2f5d43")}`;
}

function roomScene(seed: string, p: Palette): string {
  // Subject sits high and large: a wide crop of this scene used to land on
  // empty wall and read as a blank tile.
  const bedW = 380, bedX = 210, bedY = 290;
  const artOffset = rand(seed, "art", -30, 30);

  return `
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" fill="${p.skyBottom}"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.7}" fill="url(#wall)"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.7}" fill="${p.mid}" opacity="0.18"/>
    <rect x="0" y="${SCENE_HEIGHT * 0.7}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.3}" fill="${p.near}" opacity="0.35"/>

    <!-- window with a slice of the view outside -->
    <rect x="580" y="60" width="190" height="240" rx="6" fill="${p.skyTop}" opacity="0.9"/>
    <rect x="580" y="60" width="190" height="240" rx="6" fill="url(#sky)" opacity="0.85"/>
    <circle cx="${p.night ? 715 : 675}" cy="120" r="22" fill="${p.sun}" opacity="0.9"/>
    <rect x="580" y="215" width="190" height="85" fill="${p.mid}" opacity="0.55"/>
    <rect x="576" y="56" width="198" height="248" rx="8" fill="none" stroke="${p.near}" stroke-width="7"/>
    <line x1="675" y1="60" x2="675" y2="300" stroke="${p.near}" stroke-width="5"/>

    <!-- headboard, bed, linen -->
    <rect x="${bedX - 20}" y="220" width="${bedW + 40}" height="130" rx="10" fill="${p.accent}" opacity="0.35"/>
    <rect x="${bedX}" y="${bedY}" width="${bedW}" height="150" rx="10" fill="#ffffff" opacity="0.95"/>
    <rect x="${bedX}" y="${bedY + 60}" width="${bedW}" height="90" rx="10" fill="${p.accent}" opacity="0.55"/>
    <rect x="${bedX + 24}" y="${bedY - 42}" width="130" height="54" rx="12" fill="#ffffff" opacity="0.95"/>
    <rect x="${bedX + 178}" y="${bedY - 42}" width="130" height="54" rx="12" fill="#ffffff" opacity="0.9"/>
    <rect x="${bedX - 6}" y="${bedY + 148}" width="${bedW + 12}" height="18" rx="6" fill="${p.near}" opacity="0.7"/>

    <!-- nightstands and lamps -->
    <rect x="${bedX - 96}" y="${bedY + 60}" width="72" height="70" rx="6" fill="${p.mid}" opacity="0.8"/>
    <rect x="${bedX + bedW + 24}" y="${bedY + 60}" width="72" height="70" rx="6" fill="${p.mid}" opacity="0.8"/>
    <path d="M${bedX - 78} ${bedY + 60} l18 -46 l18 46 Z" fill="${p.warmLight}" opacity="0.9"/>
    <path d="M${bedX + bedW + 42} ${bedY + 60} l18 -46 l18 46 Z" fill="${p.warmLight}" opacity="0.9"/>

    <!-- wall art and rug -->
    <rect x="${(120 + artOffset).toFixed(1)}" y="90" width="104" height="80" rx="4" fill="${p.far}" opacity="0.85"/>
    <rect x="${(129 + artOffset).toFixed(1)}" y="99" width="86" height="62" rx="2" fill="${p.accent}" opacity="0.6"/>
    <ellipse cx="400" cy="560" rx="290" ry="36" fill="${p.near}" opacity="0.3"/>`;
}

function poolScene(seed: string, p: Palette): string {
  const ripples = Array.from({ length: 7 }, (_, i) => {
    const y = 400 + i * 22;
    const offset = rand(seed, `rp${i}`, -40, 40);
    return `<path d="M${60 + offset} ${y} q60 -10 120 0 t120 0 t120 0 t120 0 t120 0" stroke="#ffffff" stroke-width="2" fill="none" opacity="${(0.28 - i * 0.03).toFixed(2)}"/>`;
  }).join("");

  const loungers = [140, 250, 560, 670].map((x, i) => `
    <rect x="${x}" y="${330 + (i % 2) * 8}" width="86" height="14" rx="7" fill="#ffffff" opacity="0.9"/>
    <rect x="${x + 58}" y="${312 + (i % 2) * 8}" width="28" height="20" rx="6" fill="#ffffff" opacity="0.75"/>
    <rect x="${x + 8}" y="${344 + (i % 2) * 8}" width="8" height="16" rx="3" fill="${p.near}" opacity="0.6"/>
    <rect x="${x + 68}" y="${344 + (i % 2) * 8}" width="8" height="16" rx="3" fill="${p.near}" opacity="0.6"/>`).join("");

  return `
    ${sky()}${stars(p, seed)}${sunDisc(p, seed)}
    <rect x="0" y="150" width="${SCENE_WIDTH}" height="120" fill="${p.mid}" opacity="0.55"/>
    ${windowGrid(40, 160, 720, 100, 12, 2, p, seed, "poolbuilding")}
    <rect x="0" y="270" width="${SCENE_WIDTH}" height="110" fill="${p.ground}" opacity="0.75"/>
    ${loungers}
    <!-- umbrellas -->
    <path d="M330 300 l-46 34 h92 Z" fill="${p.accent}" opacity="0.9"/>
    <rect x="328" y="300" width="4" height="60" fill="${p.near}" opacity="0.7"/>
    <path d="M520 300 l-46 34 h92 Z" fill="${p.accent}" opacity="0.75"/>
    <rect x="518" y="300" width="4" height="60" fill="${p.near}" opacity="0.7"/>
    <!-- water -->
    <rect x="40" y="380" width="720" height="180" rx="14" fill="url(#water)"/>
    ${ripples}
    <rect x="40" y="380" width="720" height="180" rx="14" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.55"/>
    ${palm(90, 300, 0.9, p.night ? "#0e1727" : "#2f5d43")}
    ${palm(720, 296, 1.05, p.night ? "#0e1727" : "#2f5d43")}`;
}

function diningScene(seed: string, p: Palette): string {
  const tables = [150, 400, 650].map((x, i) => `
    <ellipse cx="${x}" cy="${400 + i * 6}" rx="94" ry="26" fill="#ffffff" opacity="0.94"/>
    <rect x="${x - 6}" y="${400 + i * 6}" width="12" height="78" fill="${p.near}" opacity="0.65"/>
    <ellipse cx="${x}" cy="${478 + i * 6}" rx="44" ry="11" fill="${p.near}" opacity="0.4"/>
    <circle cx="${x - 32}" cy="${393 + i * 6}" r="13" fill="${p.accent}" opacity="0.55"/>
    <rect x="${x + 18}" y="${378 + i * 6}" width="9" height="26" rx="4" fill="${p.accent}" opacity="0.75"/>`).join("");

  const pendants = [150, 400, 650].map((x, i) => `
    <line x1="${x}" y1="0" x2="${x}" y2="${250 + i * 10}" stroke="${p.near}" stroke-width="3" opacity="0.7"/>
    <path d="M${x - 36} ${300 + i * 10} l36 -52 l36 52 Z" fill="${p.accent}" opacity="0.92"/>
    <circle cx="${x}" cy="${314 + i * 10}" r="28" fill="${p.warmLight}" opacity="0.4"/>`).join("");

  return `
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" fill="${p.skyBottom}"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.66}" fill="url(#wall)"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.66}" fill="${p.mid}" opacity="0.16"/>
    <rect x="60" y="70" width="680" height="180" rx="8" fill="${p.skyTop}" opacity="0.6"/>
    <line x1="400" y1="70" x2="400" y2="250" stroke="${p.near}" stroke-width="6" opacity="0.8"/>
    <rect x="56" y="66" width="688" height="188" rx="10" fill="none" stroke="${p.near}" stroke-width="6"/>
    <rect x="0" y="${SCENE_HEIGHT * 0.66}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.34}" fill="${p.near}" opacity="0.3"/>
    ${pendants}
    ${tables}`;
}

function lobbyScene(seed: string, p: Palette): string {
  const columns = [110, 690].map((x) => `
    <rect x="${x - 26}" y="60" width="52" height="420" rx="6" fill="${p.mid}" opacity="0.75"/>
    <rect x="${x - 34}" y="52" width="68" height="16" rx="4" fill="${p.near}" opacity="0.8"/>
    <rect x="${x - 34}" y="472" width="68" height="16" rx="4" fill="${p.near}" opacity="0.8"/>`).join("");

  return `
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" fill="${p.skyBottom}"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.66}" fill="url(#wall)"/>
    <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.66}" fill="${p.mid}" opacity="0.16"/>
    ${columns}
    <!-- chandelier -->
    <line x1="400" y1="0" x2="400" y2="90" stroke="${p.near}" stroke-width="3"/>
    <circle cx="400" cy="118" r="30" fill="${p.warmLight}" opacity="0.9"/>
    <circle cx="400" cy="118" r="62" fill="${p.warmLight}" opacity="0.22"/>
    ${[352, 400, 448].map((x, i) => `<circle cx="${x}" cy="${168 + (i === 1 ? 14 : 0)}" r="11" fill="${p.warmLight}" opacity="0.75"/>`).join("")}
    <!-- reception desk -->
    <rect x="270" y="330" width="260" height="90" rx="8" fill="${p.near}" opacity="0.9"/>
    <rect x="270" y="330" width="260" height="16" rx="6" fill="${p.accent}" opacity="0.9"/>
    <rect x="300" y="250" width="200" height="60" rx="6" fill="${p.far}" opacity="0.6"/>
    <!-- seating -->
    <rect x="90" y="400" width="120" height="46" rx="12" fill="${p.accent}" opacity="0.55"/>
    <rect x="590" y="400" width="120" height="46" rx="12" fill="${p.accent}" opacity="0.45"/>
    <rect x="0" y="${SCENE_HEIGHT * 0.66}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT * 0.34}" fill="${p.ground}" opacity="0.55"/>
    <ellipse cx="400" cy="520" rx="300" ry="30" fill="${p.near}" opacity="0.18"/>
    ${palm(740, 470, 0.8, p.night ? "#101a2c" : "#2f5d43")}`;
}

/**
 * Terrain decides the palette, not the other way round: a desert rendered in
 * the sea palette read as green hills, and a night sea as a black field.
 *
 * This runs before the gradients are defined so `<defs>` and the drawing agree —
 * resolving it inside the scene left the water gradient on the outer palette and
 * painted night seas gold.
 */
function viewVariant(seed: string): "sea" | "dunes" | "city" {
  return pick(seed, "viewkind", ["sea", "dunes", "city"] as const);
}

function viewPalette(seed: string, base: Palette): Palette {
  const kind = viewVariant(seed);
  if (kind === "dunes") return { ...PALETTES[2], night: false };
  if (kind === "sea") {
    return base.night
      ? { ...PALETTES[4], skyTop: "#1b2c4a", skyBottom: "#54749a", sun: "#e8eeff", accent: "#1f5a70", night: true }
      : PALETTES[4];
  }
  return base;
}

function viewScene(seed: string, p: Palette): string {
  const kind = viewVariant(seed);
  const horizon = 330;

  const body =
    kind === "sea"
      ? `
        <rect x="0" y="${horizon}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT - horizon}" fill="url(#water)"/>
        ${p.night ? `<path d="M370 ${horizon} h60 l40 ${SCENE_HEIGHT - horizon} h-140 Z" fill="${p.sun}" opacity="0.16"/>` : ""}
        ${Array.from({ length: 9 }, (_, i) => {
          const y = horizon + 24 + i * 26;
          const off = rand(seed, `wv${i}`, -50, 50);
          return `<path d="M${-40 + off} ${y} q70 -9 140 0 t140 0 t140 0 t140 0 t140 0" stroke="#ffffff" stroke-width="2" fill="none" opacity="${(0.3 - i * 0.028).toFixed(2)}"/>`;
        }).join("")}
        <path d="M0 ${horizon} h${SCENE_WIDTH}" stroke="${p.far}" stroke-width="2" opacity="0.7"/>`
      : kind === "dunes"
        ? `
        <path d="M0 ${horizon + 40} q200 -60 400 0 t400 -10 v${SCENE_HEIGHT} H0 Z" fill="${p.far}"/>
        <path d="M0 ${horizon + 40} q200 -60 400 0 t400 -10" stroke="${p.sun}" stroke-width="3" fill="none" opacity="0.6"/>
        <path d="M0 ${horizon + 110} q240 -50 480 10 t320 -20 v${SCENE_HEIGHT} H0 Z" fill="${p.mid}"/>
        <path d="M0 ${horizon + 200} q300 -40 600 20 t200 0 v${SCENE_HEIGHT} H0 Z" fill="${p.near}"/>`
        : `
        ${Array.from({ length: 9 }, (_, i) => {
          const w = rand(seed, `cw${i}`, 55, 105);
          const h = rand(seed, `ch${i}`, 90, 230);
          const x = i * 92 + rand(seed, `cx${i}`, -10, 10);
          return `<rect x="${x.toFixed(1)}" y="${(horizon - h).toFixed(1)}" width="${w.toFixed(1)}" height="${(h + 300).toFixed(1)}" rx="3" fill="${i % 2 ? p.mid : p.near}" opacity="0.95"/>
                  ${windowGrid(x, horizon - h + 14, w, h - 24, 2, Math.max(2, Math.round(h / 44)), p, seed, `cg${i}`)}`;
        }).join("")}
        <rect x="0" y="${horizon + 200}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT - horizon - 200}" fill="${p.ground}"/>`;

  return `
    ${sky()}${stars(p, seed)}${sunDisc(p, seed)}${birds(seed, p)}
    ${body}
    <!-- balcony railing, which is what makes it read as a view *from* a room -->
    <rect x="0" y="${SCENE_HEIGHT - 110}" width="${SCENE_WIDTH}" height="10" rx="4" fill="${p.near}"/>
    ${Array.from({ length: 22 }, (_, i) => `<rect x="${(i * 38 + 10).toFixed(0)}" y="${SCENE_HEIGHT - 106}" width="6" height="106" fill="${p.near}" opacity="0.85"/>`).join("")}
    <rect x="0" y="${SCENE_HEIGHT - 24}" width="${SCENE_WIDTH}" height="24" fill="${p.ground}"/>`;
}

/** City-specific silhouettes for destination cards. */
const LANDMARKS: Record<string, (p: Palette) => string> = {
  riyadh: (p) => `
    <rect x="330" y="180" width="140" height="330" rx="8" fill="${p.near}"/>
    <path d="M330 260 q70 -110 140 0" fill="none" stroke="${p.near}" stroke-width="26"/>
    <rect x="366" y="120" width="68" height="70" rx="6" fill="${p.near}"/>
    <rect x="180" y="300" width="90" height="210" rx="5" fill="${p.mid}"/>
    <rect x="530" y="270" width="110" height="240" rx="5" fill="${p.mid}"/>
    <path d="M640 270 l55 -60 v300 h-55 Z" fill="${p.far}"/>`,
  jeddah: (p) => `
    <path d="M400 90 v420" stroke="${p.near}" stroke-width="16"/>
    <path d="M400 110 q-90 90 -40 210 q40 -120 40 -210 Z" fill="${p.accent}" opacity="0.85"/>
    <path d="M400 110 q90 90 40 210 q-40 -120 -40 -210 Z" fill="${p.accent}" opacity="0.7"/>
    <rect x="150" y="360" width="120" height="150" rx="6" fill="${p.mid}"/>
    <rect x="560" y="330" width="130" height="180" rx="6" fill="${p.mid}"/>`,
  makkah: (p) => `
    <rect x="330" y="140" width="150" height="370" rx="8" fill="${p.near}"/>
    <rect x="352" y="176" width="106" height="106" rx="6" fill="${p.warmLight}" opacity="0.9"/>
    <path d="M405 100 v46" stroke="${p.accent}" stroke-width="10"/>
    <circle cx="405" cy="92" r="16" fill="${p.accent}"/>
    <rect x="170" y="330" width="110" height="180" rx="6" fill="${p.mid}"/>
    <rect x="540" y="350" width="110" height="160" rx="6" fill="${p.mid}"/>
    ${[200, 250, 570, 620].map((x) => `<path d="M${x} 330 v-56" stroke="${p.mid}" stroke-width="9"/><circle cx="${x}" cy="266" r="9" fill="${p.mid}"/>`).join("")}`,
  dubai: (p) => `
    <path d="M400 60 l34 200 l-34 250 l-34 -250 Z" fill="${p.near}"/>
    <path d="M400 60 v450" stroke="${p.far}" stroke-width="3" opacity="0.6"/>
    <rect x="200" y="290" width="90" height="220" rx="5" fill="${p.mid}"/>
    <rect x="520" y="250" width="100" height="260" rx="5" fill="${p.mid}"/>
    <path d="M620 250 q60 -40 90 30 v230 h-90 Z" fill="${p.far}"/>`,
  doha: (p) => `
    <path d="M330 510 v-230 q40 -120 80 0 v230 Z" fill="${p.near}"/>
    <rect x="220" y="330" width="80" height="180" rx="6" fill="${p.mid}"/>
    <path d="M470 510 v-200 q35 -90 70 0 v200 Z" fill="${p.mid}"/>
    <rect x="570" y="360" width="90" height="150" rx="6" fill="${p.far}"/>`,
  istanbul: (p) => `
    <path d="M300 510 v-140 a100 100 0 0 1 200 0 v140 Z" fill="${p.near}"/>
    <circle cx="400" cy="250" r="16" fill="${p.accent}"/>
    ${[250, 550].map((x) => `<rect x="${x - 10}" y="200" width="20" height="310" rx="8" fill="${p.mid}"/><path d="M${x} 178 l12 26 h-24 Z" fill="${p.mid}"/>`).join("")}
    <rect x="120" y="400" width="90" height="110" rx="6" fill="${p.far}"/>
    <rect x="600" y="420" width="90" height="90" rx="6" fill="${p.far}"/>`,
};

function landmarkScene(seed: string, p: Palette, destination?: string): string {
  const draw = LANDMARKS[destination ?? ""] ?? LANDMARKS.riyadh;
  return `
    ${sky()}${stars(p, seed)}${sunDisc(p, seed)}${birds(seed, p)}
    ${draw(p)}
    <rect x="0" y="${SCENE_HEIGHT - 90}" width="${SCENE_WIDTH}" height="90" fill="${p.ground}"/>
    <rect x="0" y="${SCENE_HEIGHT - 90}" width="${SCENE_WIDTH}" height="3" fill="${p.accent}" opacity="0.4"/>`;
}

/** The single place scene URLs are built, so the cache token is never forgotten. */
export function sceneUrl(seed: string, kind: SceneKind, destination?: string): string {
  const params = new URLSearchParams({ seed, kind, v: String(SCENE_VERSION) });
  if (destination) params.set("dest", destination);
  return `/api/image?${params.toString()}`;
}

/** Collection tags pick the scene that best represents them. */
export function sceneKindForTag(tag: string): SceneKind {
  switch (tag) {
    case "family":
    case "accessible":
      return "room";
    case "business":
    case "luxury":
      return "lobby";
    case "beach":
      return "pool";
    case "city":
      return "exterior";
    case "value":
    case "lastminute":
      return "view";
    default:
      return "exterior";
  }
}

/* ------------------------------------------------------------------ build */

export function renderScene(seed: string, kind: SceneKind, destination?: string): string {
  const base = paletteFor(seed, kind);
  // The view scene swaps palette by terrain; resolve it first so the gradient
  // definitions below are built from the palette that actually gets drawn.
  const p = kind === "view" ? viewPalette(seed, base) : base;
  const interior = kind === "room" || kind === "dining" || kind === "lobby";

  const body =
    kind === "room" ? roomScene(seed, p)
    : kind === "pool" ? poolScene(seed, p)
    : kind === "dining" ? diningScene(seed, p)
    : kind === "lobby" ? lobbyScene(seed, p)
    : kind === "view" ? viewScene(seed, p)
    : kind === "landmark" ? landmarkScene(seed, p, destination)
    : exteriorScene(seed, p);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" viewBox="0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}" role="img" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.skyTop}"/>
      <stop offset="100%" stop-color="${p.skyBottom}"/>
    </linearGradient>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.skyTop}" stop-opacity="${interior ? 0.35 : 1}"/>
      <stop offset="100%" stop-color="${p.skyBottom}" stop-opacity="${interior ? 0.9 : 1}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.accent}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${p.skyTop}" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0%" stop-color="${p.sun}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${p.sun}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.26"/>
    </radialGradient>
  </defs>
  ${body}
  <rect width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" fill="url(#vignette)"/>
</svg>`;
}
