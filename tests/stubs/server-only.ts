/**
 * Test stub for the `server-only` build guard.
 *
 * The real package throws when it is pulled into a client bundle, which is
 * exactly the protection we want in the app. Under vitest these modules run on
 * the server by definition, so the guard resolves to nothing.
 */
export {};
