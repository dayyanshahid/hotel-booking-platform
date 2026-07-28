import { localeFrom, ok, readJson, sanitize } from "@/lib/server/api";
import { interpretTrip } from "@/lib/server/interpret";
import { isCurrencyCode } from "@/lib/currencies";
import type { CurrencyCode } from "@/lib/types";

/**
 * POST /api/search/interpret — a sentence in, a runnable search out.
 *
 * Server-side because it resolves the destination through the same suggestion
 * index the search bar uses, which knows the whole catalogue and the live
 * supplier destinations. Doing it in the browser is what limited the previous
 * version to six cities hard-coded in a regex.
 */
export async function POST(req: Request) {
  const locale = localeFrom(req);
  const body = await readJson<{ text: string; currency?: string }>(req);
  const text = sanitize(body?.text ?? "", 300);
  if (!text.trim()) return ok({ intent: null, filters: {}, understood: [], assumed: [], missing: ["text"] });

  const currency: CurrencyCode = isCurrencyCode((body?.currency ?? "").toUpperCase())
    ? ((body!.currency as string).toUpperCase() as CurrencyCode)
    : "USD";

  return ok(await interpretTrip(text, locale, currency));
}
