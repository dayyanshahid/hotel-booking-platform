import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never write into the project's real content cache.
    env: { HOTELBEDS_CACHE_DIR: path.resolve(__dirname, "node_modules/.cache/hotelbeds-test") },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      /**
       * `server-only` is a build-time guard that throws outside a server
       * component graph. The tests exercise those modules directly on the
       * server, so it resolves to a no-op here.
       */
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
