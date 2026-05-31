import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject } from "vitest/config";

// Component tests run under jsdom with the React plugin only — the React Router
// Vite plugin is intentionally excluded so tests render components directly.
export default defineProject({
  plugins: [react(), tsconfigPaths()],
  test: {
    name: "web-app",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
