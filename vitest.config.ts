import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests must never write into the project's real content cache — or its
    // run-time data. A store test that persists leaves fixture agencies in the
    // dev environment, which is how a demo ends up signing in as "Test Travel".
    env: {
      HOTELBEDS_CACHE_DIR: path.resolve(__dirname, "node_modules/.cache/hotelbeds-test"),
      NAZIL_DATA_DIR: path.resolve(__dirname, "node_modules/.cache/data-test"),
    },
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
