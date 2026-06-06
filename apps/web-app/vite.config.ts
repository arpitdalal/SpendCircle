import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // The shared .env.local lives at the monorepo root, so load env from there for
  // both dev and the SPA prerender build (which instantiates the Convex client).
  envDir: "../..",
  server: {
    // Bind IPv4 127.0.0.1 explicitly. Vite's default host is `localhost`, which on
    // this machine resolves to IPv6 `::1` only — so the server never listened on
    // 127.0.0.1, and the Better Auth OAuth callback (SITE_URL=http://127.0.0.1:5173)
    // round-tripped back to a 127.0.0.1 address nothing was listening on
    // (ERR_CONNECTION_REFUSED). Pinning the host to 127.0.0.1 matches SITE_URL.
    host: "127.0.0.1",
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
