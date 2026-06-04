import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The shared .env.local lives at the monorepo root, so load env from there for
  // both dev and the SPA prerender build (which instantiates the Convex client).
  envDir: "../..",
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // React Router's SPA entry is a virtual module the dep scanner can't crawl
    // statically, so without explicit entries Vite discovers every dependency at
    // runtime on the first page load and reloads once to re-bundle them. That
    // cold-start reload races the E2E auth bootstrap (e2e/global-setup.ts) and
    // intermittently times it out. Pointing the scanner at the app source (minus
    // tests) makes it pre-bundle the whole graph up front — convex, better-auth,
    // and any transitive dep of a shared workspace package (e.g. zod via the
    // domain schemas) — so the first load is stable. This scales: new deps behind
    // shared packages are found automatically, with no per-dep include list.
    entries: ["app/**/*.{ts,tsx}", "!app/**/*.test.{ts,tsx}"],
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), reactRouter()],
});
