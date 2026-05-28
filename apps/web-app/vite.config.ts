import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  return {
    envDir: "../..",
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: env.VITE_CONVEX_SITE_URL
        ? {
            "/api/auth": {
              target: env.VITE_CONVEX_SITE_URL,
              changeOrigin: true
            }
          }
        : undefined
    }
  };
});
