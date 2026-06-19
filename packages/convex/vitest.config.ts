import { defineProject } from "vitest/config";

// Convex integration tests run under edge-runtime (convex-test) so the function
// runtime matches production semantics. See ADR 0006.
export default defineProject({
  test: {
    name: "convex",
    environment: "edge-runtime",
    setupFiles: ["./vitest.setup.ts"],
    include: ["convex/**/*.test.ts"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
