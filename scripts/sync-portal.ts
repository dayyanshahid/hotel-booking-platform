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
 * What still flows outward, now that the portals own their own screens.
 *
 * This repository is the shop. The agency portal and the operator console are
 * their own codebases and hold their own pages, components and domain — none
 * of that lives here any more, so none of it is copied.
 *
 * What is still shared is the design system and the client-side library: the
 * `ui` kit, the providers, the translations, the formatters, the URL helpers.
 * Three front ends rendering the same product should not disagree about what a
 * button looks like or how a price is written, and there is no package to
 * publish between them, so the files are copied — which works right up until
 * somebody does it by hand, misses one, and spends an afternoon on a bug that
 * was fixed a week ago in another repository.
 */
/**
 * The shared surface, and only it.
 *
 * Deliberately a list of roots rather than "everything": a portal that received
 * `app/` would be handed the shop's pages, and one that received all of `lib/`
 * would be handed a catalogue client it has no use for. Each portal's own
 * screens are its own business.
 */
const SHARED = [
  "components/ui",
  "components/providers",
  "lib/i18n.ts",
  "lib/types.ts",
  "lib/format.ts",
  "lib/nav.ts",
  "lib/text.ts",
  "lib/hash.ts",
  "lib/currencies.ts",
  "lib/api-client.ts",
  "lib/api-origin.ts",
  "lib/cookies.ts",
  "app/globals.css",
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


  if (!(await fs.stat(path.join(target, "package.json")).catch(() => null))) {
    console.error(`No portal at ${target}. Pass its path as the first argument.`);
    process.exit(1);
  }

  const here = process.cwd();
  const updated: string[] = [];
  const added: string[] = [];
  const skipped: string[] = [];

  for (const entry of SHARED) {
    const stat = await fs.stat(path.join(here, entry)).catch(() => null);
    if (!stat) {
      skipped.push(`${entry} (not in this repository)`);
      continue;
    }
    const files = stat.isDirectory() ? await walk(path.join(here, entry), here) : [entry];

    for (const rel of files) {
      const to = path.join(target, rel);
      const present = Boolean(await fs.stat(to).catch(() => null));
      const source = await fs.readFile(rel);

      if (!present) {
        /*
         * Shared code is added rather than skipped when it is missing.
         *
         * The old rule — only update what the portal already has — was right
         * when this repository held the portals' screens and copying a page
         * they had no route for would break them. These are the design system
         * and the client library: a portal that is missing a button has a
         * build error waiting, not a file it chose not to have.
         */
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.writeFile(to, source);
        added.push(rel);
        continue;
      }

      const existing = await fs.readFile(to);
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
