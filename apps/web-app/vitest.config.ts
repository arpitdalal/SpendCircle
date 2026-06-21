import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

// Component tests run under jsdom with the React plugin only — the React Router
// Vite plugin is intentionally excluded so tests render components directly.
const appVersion = process.env.npm_package_version ?? "0.0.0";

export default defineProject({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
