import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["packages/convex/convex/**/*.test.ts", "edge-runtime"]],
    include: ["packages/**/*.test.ts", "apps/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
