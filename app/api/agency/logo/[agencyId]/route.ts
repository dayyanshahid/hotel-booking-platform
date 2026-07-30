import { getLogo } from "@/lib/agency/logo";

/**
 * Serving an agency's logo.
 *
 * Deliberately unauthenticated. It is printed on vouchers and quotations that
 * an agency hands to travellers, so it has to load for someone who has never
 * signed in — and it is a company's own logo, which is about as public as an
 * asset gets. Nothing else about the agency is reachable from here: the id is
 * the only input and an image is the only output.
 *
 * The headers matter more than usual because this is user-supplied content
 * served from our own origin. The type is the one sniffed from the bytes at
 * upload, `nosniff` stops a browser from deciding otherwise, and the sandbox
 * CSP means that even if something ever did get stored that could execute, it
 * would have nothing to execute against.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ agencyId: string }> }) {
  const { agencyId } = await ctx.params;
  const stored = await getLogo(agencyId);
  if (!stored) return new Response(null, { status: 404 });

  const bytes = Buffer.from(stored.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": stored.contentType,
      "content-length": String(bytes.byteLength),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      /*
       * Cached hard, and busted by a query string.
       *
       * The URL the documents render carries the upload timestamp, so a new
       * logo is a new URL and this copy can be kept for a year. Without that
       * the alternative is re-fetching a logo that changes twice a decade on
       * every voucher anyone opens.
       */
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export const dynamic = "force-dynamic";
