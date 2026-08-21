import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Copy the shared front end into the agent portal.
 *
 *   npm run portal:sync -- ../travel-agent-portal
 *
 * The portal is a separate deployment on its own origin, and it renders the
 * same agency screens from the same components. There is no package to publish
 * between them, so the files are copied — which works right up until somebody
 * does it by hand, misses one, and spends an afternoon on a bug that was fixed
 * a week ago in the other repository.
 *
 * Two rules make it safe to run repeatedly.
 *
 * The portal owns a few files outright and they are never overwritten: its
 * root layout carries no consumer chrome, its property page fetches from the
 * API instead of importing a catalogue it does not have, and its proxy sends
 * every URL to the portal because that is all this deployment is. Overwriting
 * any of those replaces the portal with a broken copy of the consumer app —
 * which is exactly what a careless `cp` did, because the glob it used could
 * not match a path containing `[locale]`.
 *
 * And only files the portal already has are updated. A component that exists
 * here and not there is one the portal has no route for; copying it in would
 * drag server imports across and break the build.
 */

/**
 * Which portal is being synced.
 *
 * There are two now — the agency portal and the operator console — and they
 * differ in exactly one way that matters here: the section of `app/[locale]`
 * that belongs to them. Everything else is identical, so this is one script
 * with a section rather than two scripts that would agree until the day
 * somebody fixed a bug in one of them.
 */
const SECTIONS = {
  agency: {
    /** Files the portal deliberately does its own way. */
    owned: ["app/[locale]/agency/hotel/[slug]/page.tsx"],
  },
  admin: { owned: [] as string[] },
} as const;

type SectionName = keyof typeof SECTIONS;

/** Owned by every portal, whichever section it serves. */
const ALWAYS_OWNED = [
  "app/[locale]/layout.tsx",
  "proxy.ts",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "README.md",
];

const SHARED_ROOTS = ["app", "components", "lib", "tests"];
const EXTENSIONS = /\.(ts|tsx|css)$/;

async function walk(dir: string, base: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (EXTENSIONS.test(entry.name)) out.push(path.relative(base, full));
  }
  return out;
}

async function main(): Promise<void> {
  const target = path.resolve(process.argv[2] ?? "../travel-agent-portal");

  /*
   * Inferred from the target rather than passed as a flag.
   *
   * A flag can disagree with the directory, and the failure would be silent
   * and destructive: syncing the agency section into the console overwrites
   * one portal with another's screens. The directory name is the one thing
   * that cannot be wrong about which portal this is.
   */
  const section: SectionName = path.basename(target).includes("admin") ? "admin" : "agency";
  const owned = new Set([...ALWAYS_OWNED, ...SECTIONS[section].owned]);
  const sectionRoot = path.join("app", "[locale]", section);
  if (!(await fs.stat(path.join(target, "package.json")).catch(() => null))) {
    console.error(`No portal at ${target}. Pass its path as the first argument.`);
    process.exit(1);
  }

  const here = process.cwd();
  const updated: string[] = [];
  const added: string[] = [];
  const skipped: string[] = [];

  for (const root of SHARED_ROOTS) {
    for (const rel of await walk(path.join(here, root), here)) {
      if (owned.has(rel)) {
        skipped.push(rel);
        continue;
      }
      const to = path.join(target, rel);
      const present = Boolean(await fs.stat(to).catch(() => null));

      if (!present) {
        /*
         * Only what the portal already carries — except a new route in its own
         * section, which is the portal's whole reason to exist.
         *
         * Copying every route turns the portal into a broken copy of the
         * consumer app, a hundred files of it, which is what happened when
         * that was tried. But the opposite rule was silently wrong too: a page
         * added under the portal's section was never copied, so it kept building
         * happily with a sidebar link to a route it did not have. Found when
         * the dashboard was split onto its own page and the portal's copy
         * 404ed while the platform's worked.
         */
        if (!rel.startsWith(sectionRoot + path.sep)) continue;
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.writeFile(to, await fs.readFile(rel));
        added.push(rel);
        continue;
      }

      const [source, existing] = await Promise.all([fs.readFile(rel), fs.readFile(to)]);
      if (source.equals(existing)) continue;
      await fs.writeFile(to, source);
      updated.push(rel);
    }
  }

  /*
   * Then the modules those files import and the portal has not got.
   *
   * Extracting a helper so a client bundle can use it — `lib/hash` was pulled
   * out of the pricing module for exactly that — updates a shared file and
   * leaves the portal importing something that is not there. Following the
   * imports is the difference between a sync that compiles and one that copies
   * the right bytes into a build that fails.
   *
   * Followed transitively, and nothing that reaches into `lib/server` comes
   * across: that is the boundary the whole split exists to keep.
   */
  const pending = [...updated];
  while (pending.length) {
    const from = pending.pop()!;
    const text = await fs.readFile(path.join(target, from), "utf8");
    for (const match of text.matchAll(/from\s+["'](@\/[^"']+|\.[^"']+)["']/g)) {
      const spec = match[1];
      const resolvedBase = spec.startsWith("@/")
        ? spec.slice(2)
        : path.normalize(path.join(path.dirname(from), spec));
      if (resolvedBase.startsWith("lib/server/")) continue;

      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const candidate = `${resolvedBase}${ext}`;
        if (!(await fs.stat(path.join(here, candidate)).catch(() => null))) continue;
        if (await fs.stat(path.join(target, candidate)).catch(() => null)) break;

        const body = await fs.readFile(path.join(here, candidate));
        if (body.toString("utf8").includes('"server-only"')) {
          skipped.push(`${candidate} (needed, but server-only)`);
          break;
        }
        await fs.mkdir(path.dirname(path.join(target, candidate)), { recursive: true });
        await fs.writeFile(path.join(target, candidate), body);
        added.push(candidate);
        pending.push(candidate);
        break;
      }
    }
  }

  for (const file of added) console.log(`  added   ${file}`);
  for (const file of updated) console.log(`  updated ${file}`);
  for (const file of skipped) console.log(`  skipped ${file}`);
  console.log(
    `\n${added.length} added, ${updated.length} updated in ${path.basename(target)}; ` +
      `${skipped.length} left alone.`,
  );
  console.log("Run the portal's typecheck and build before committing.");
}

void main().catch((error) => {
  console.error("Sync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
