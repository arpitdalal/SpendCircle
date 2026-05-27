import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
