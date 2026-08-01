/**
 * A stable number in [0, 1) from a string.
 *
 * FNV-1a, chosen because it is short, has no dependencies and gives the same
 * answer everywhere — which is the whole requirement. It decides things that
 * must not flicker between a server render and a client one, or between two
 * instances serving the same page: which illustration a property gets, which
 * of several equal-priced rooms leads a card.
 *
 * It lived in the pricing module, which is server-only. That was fine until a
 * client-safe illustration module needed it, and then it was a client bundle
 * importing server code — and, on the front end that carries no server code at
 * all, a build error. It is neither pricing nor server: it is arithmetic.
 */
export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
