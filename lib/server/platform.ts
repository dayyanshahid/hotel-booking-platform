import "server-only";
import { storedSettings } from "../admin/store";
import { setMarkupOverride } from "./markup";

/**
 * Load the operator's commercial settings into this instance.
 *
 * `applyMarkup` runs synchronously inside the supplier adapters, so the stored
 * override cannot be fetched at the point of use. Instead every request path
 * that prices something calls this first — cheap, because the underlying store
 * only re-reads its file when the file has actually changed.
 *
 * Missing settings leave the deployed default in place rather than zeroing the
 * markup: a store that failed to load must not sell everything at cost.
 */
export async function primeMarkup(): Promise<void> {
  try {
    const settings = await storedSettings();
    setMarkupOverride(settings?.markupPercent);
  } catch {
    // Keep whatever is already in effect.
  }
}
