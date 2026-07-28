/**
 * Matching what people type against what the catalogue holds.
 *
 * The catalogue spells places properly — Reykjavík, Zürich, São Paulo, Kraków —
 * and almost nobody types the accents. Comparing lowercased strings directly
 * meant the full, correctly-spelled name returned *nothing* while a prefix
 * typed before the accent still worked: "reyk" found Reykjavík and "reykjavik"
 * did not. Every city with a diacritic was effectively unsearchable by its own
 * name, on the consumer search bar, the agency portal and the trip interpreter
 * alike.
 *
 * Folding strips the accents from both sides, so the comparison is between what
 * someone meant rather than how it is spelled. Arabic gets the same treatment
 * for its optional marks and for the alef and ya variants people type
 * interchangeably.
 *
 * This lives in its own leaf module rather than beside the search code because
 * both the platform search and each supplier's own index need it, and having
 * them import from each other made a cycle.
 */
export function fold(value: string): string {
  return (
    value
      .toLowerCase()
      /*
       * Letter-level folds run *before* decomposition, not after.
       *
       * NFD splits إ into a bare alef plus a combining hamza-below, so a later
       * `replace(/[أإآ]/)` finds nothing to replace and NFC puts the hamza
       * straight back. Istanbul stayed unsearchable in Arabic for exactly that
       * reason while every other variant worked.
       */
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[ىی]/g, "ي")
      .normalize("NFD")
      // Latin combining accents, then the full Arabic mark block — harakat,
      // hamza above and below, maddah. All optional in writing, none typed.
      .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
      .normalize("NFC")
  );
}

/** True when the folded haystack contains the already-folded needle. */
export function foldedIncludes(haystack: string, foldedNeedle: string): boolean {
  return fold(haystack).includes(foldedNeedle);
}
