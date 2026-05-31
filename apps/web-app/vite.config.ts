import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // The shared .env.local lives at the monorepo root, so load env from there for
  // both dev and the SPA prerender build (which instantiates the Convex client).
  envDir: "../..",
  server: {
    port: 5173,
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
