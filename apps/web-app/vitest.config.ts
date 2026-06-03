import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

// Component tests run under jsdom with the React plugin only — the React Router
// Vite plugin is intentionally excluded so tests render components directly.
export default defineProject({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: "web-app",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
