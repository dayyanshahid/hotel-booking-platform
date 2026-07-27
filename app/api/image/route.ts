import { renderScene, SCENE_KINDS, type SceneKind } from "@/lib/illustration/scenes";

/**
 * Deterministic property imagery.
 *
 * Real deployments serve licensed supplier content through a CDN with
 * srcset/AVIF transformation (§12.2). This route stands in for that pipeline:
 * the same seed always renders the same scene, so pages are stable across
 * reloads and deploys, nothing is fetched off-platform, and no image can 404.
 *
 * Live Hotelbeds properties use the supplier's own photography instead — this
 * only backs the demo catalogue and the illustrated states.
 *
 * The `v` parameter is the artwork version. It is not read here: its only job is
 * to make the URL change when the drawing changes, so the immutable cache below
 * cannot pin a visitor to old art.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const seed = url.searchParams.get("seed") ?? "default";
  const requested = url.searchParams.get("kind") ?? "exterior";
  const destination = url.searchParams.get("dest") ?? undefined;
  const kind: SceneKind = (SCENE_KINDS as string[]).includes(requested)
    ? (requested as SceneKind)
    : "exterior";

  return new Response(renderScene(seed, kind, destination), {
    headers: {
      "content-type": "image/svg+xml",
      // Immutable: the output is a pure function of the query.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
