import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173"
  },
  webServer: {
    command: "VITE_AUTH_MODE=dev /opt/homebrew/bin/pnpm --filter @spend-circle/web-app dev --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
