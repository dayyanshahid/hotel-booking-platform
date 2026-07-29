import "server-only";
import { storedSettings } from "../admin/store";
import { setMarkupOverride } from "./markup";
import { setFxOverrides } from "./fx";

/**
 * Load the operator's commercial settings into this instance.
 *
 * `applyMarkup` and `convertCurrency` both run synchronously inside the
 * supplier adapters, so neither the markup nor the exchange rates can be
 * fetched at the point of use. Instead every request path that prices something
 * calls this first — cheap, because the underlying store only re-reads its file
 * when the file has actually changed.
 *
 * Missing settings leave the deployed defaults in place rather than zeroing
 * anything: a store that failed to load must not sell everything at cost, and
 * must not convert every currency at a rate of nothing.
 */
export async function primeMarkup(): Promise<void> {
  try {
    const settings = await storedSettings();
    setMarkupOverride(settings?.markupPercent);
    setFxOverrides((settings?.fxRates ?? {}) as Record<string, number>);
  } catch {
    // Keep whatever is already in effect.
  }
}
