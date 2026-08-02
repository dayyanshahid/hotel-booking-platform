import type { Suggestion } from "./types";

/**
 * Turning what somebody typed into a place we can search.
 *
 * The destination field is a combobox, and a combobox has one rule that nobody
 * outside the team knows: the text is not the answer, the *selection* is. Type
 * "Singapore", press Search, and the search is refused — "Choose a destination
 * from the list" — because `destinationId` is still empty. Every field on the
 * bar is filled in, the city is spelled correctly and on screen, and the button
 * does nothing but scold. It is the single most common way this form is used
 * wrongly, and it is not the user being wrong.
 *
 * So the text gets one more chance before the refusal: if it names exactly one
 * plausible place, that is the place. Kept out of the component, and free of
 * anything that only runs in a browser, so the rule can be tested for what it
 * is — a judgement about ambiguity — rather than through a rendered dropdown.
 */

/**
 * Which kind of place a stay is most usefully searched in.
 *
 * Used only to choose between entries of the *same* name in the same country.
 * A city leads because that is the unit a stay is booked in: given "Singapore"
 * as both a city and a country, the city is the search and the country would
 * merely be a wider way of reaching it. A hotel is last — it is a property
 * rather than a place, and is never assumed.
 */
const GRAIN: Suggestion["type"][] = [
  "city",
  "neighborhood",
  "landmark",
  "airport",
  "region",
  "country",
  "hotel",
];

/** How sure we are, and therefore whether it is safe to act without asking. */
export type MatchConfidence = "exact" | "leading" | "ambiguous" | "none";

export interface DestinationMatch {
  confidence: MatchConfidence;
  suggestion: Suggestion | null;
}

/**
 * Compared with the accents, case and punctuation taken out.
 *
 * "dubai" must match "Dubai", and "Málaga" typed on a keyboard without the
 * accent must match "Málaga". This is the same folding the suggestion index
 * does; matching without it would refuse the correctly spelled city because
 * of a diacritic the agent's keyboard cannot produce.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Which suggestion the typed text meant, if any.
 *
 * Three rules, in order of how much they assume:
 *
 * `exact` — the text is somebody's name. Acting on it is not a guess.
 *
 * `leading` — one candidate stands out: either it is the only one, or it is a
 * place rather than a property and the runners-up are not equally good prefix
 * matches. The suggestion list is already ranked, so "the first one" is not
 * arbitrary; it is the same row the agent would have clicked.
 *
 * `ambiguous` — several places answer to this name, and picking one of them
 * silently is how an agent quotes a hotel in the wrong Springfield. The field
 * asks instead, which is what it always did.
 */
export function matchDestination(query: string, suggestions: Suggestion[]): DestinationMatch {
  const typed = fold(query);
  if (typed.length < 2 || !suggestions.length) return { confidence: "none", suggestion: null };

  const exact = suggestions.filter((s) => fold(s.label) === typed);
  if (exact.length === 1) return { confidence: "exact", suggestion: exact[0] };
  if (exact.length > 1) {
    /*
     * Two entries with one name are not necessarily two places.
     *
     * Singapore is a city and a country and the same square of the map; so are
     * Monaco, Macau and Hong Kong, and the index rightly lists each twice. An
     * agent typing "Singapore" has not asked an ambiguous question, and making
     * them disambiguate a city-state from itself is a puzzle with no answer.
     * Where they agree on the country, the narrower one is what a stay is
     * searched in.
     *
     * Cairo, Egypt and Cairo, Illinois are the opposite case and the reason
     * this function exists: same name, different countries, and the difference
     * between them is a customer's holiday.
     */
    const countries = new Set(exact.map((s) => s.countryCode ?? ""));
    if (countries.size > 1) return { confidence: "ambiguous", suggestion: null };

    const best = Math.min(...exact.map((s) => GRAIN.indexOf(s.type)));
    const finalists = exact.filter((s) => GRAIN.indexOf(s.type) === best);
    // Two cities of one name inside one country — three Springfields — are
    // still a question only the agent can answer.
    if (finalists.length !== 1) return { confidence: "ambiguous", suggestion: null };
    return { confidence: "exact", suggestion: finalists[0] };
  }

  const [first, ...rest] = suggestions;
  if (!rest.length) return { confidence: "leading", suggestion: first };

  /*
   * A property is never assumed.
   *
   * "Hilton" matches four hundred hotels and the agent means a chain, not the
   * first one alphabetically. A city with hotels beneath it is the ordinary
   * shape of this list and the city is what was meant.
   */
  if (first.type === "hotel") return { confidence: "ambiguous", suggestion: null };

  const leads = fold(first.label).startsWith(typed);
  const rivals = rest.filter((s) => s.type !== "hotel" && fold(s.label).startsWith(typed));
  if (leads && !rivals.length) return { confidence: "leading", suggestion: first };

  return { confidence: "ambiguous", suggestion: null };
}

/** Whether a match may be acted on without the agent choosing from the list. */
export function isConfident(match: DestinationMatch): boolean {
  return match.confidence === "exact" || match.confidence === "leading";
}
