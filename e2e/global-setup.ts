import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/state.json";

/**
 * TRUE-E2E auth bootstrap (ADR 0019). Establishes a real Better Auth session
 * against the self-hosted backend WITHOUT Google, then persists it as
 * storageState so every spec starts authenticated.
 *
 * It drives the app's own `authClient` (via the gated `window.__scE2E` helper)
 * rather than poking storage keys directly, so whatever the client persists
 * (cookie and/or localStorage) is captured faithfully and version-proof.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:5173";
  const email = `e2e+${Date.now()}@example.com`;
  const password = "e2e-Password-123";

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    // webServer is up by now, but be defensive about ordering: retry the initial load.
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(baseURL, { waitUntil: "domcontentloaded" });
        break;
      } catch (err) {
        if (attempt >= 30) throw err;
        await page.waitForTimeout(1000);
      }
    }

    // The gated helper is installed before hydration when VITE_E2E=true.
    await page.waitForFunction(() => "__scE2E" in window, { timeout: 30_000 });
    const result = await page.evaluate(
      ([e, p]) =>
        (
          window as unknown as { __scE2E: { signIn(e: string, p: string): Promise<unknown> } }
        ).__scE2E
          .signIn(e, p)
          .then(() => "ok")
          .catch((err: unknown) => `error: ${String((err as Error)?.message ?? err)}`),
      [email, password] as const,
    );
    if (result !== "ok") throw new Error(`E2E sign-in failed: ${result}`);

    // Better Auth 1.6 persists the session for the next app boot, but the already
    // mounted sign-in route does not synchronously re-resolve Convex auth state.
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    // Confirm the authenticated shell actually renders from the real backend.
    await page.getByRole("heading", { name: "Your circles" }).waitFor({ timeout: 30_000 });

    await mkdir(dirname(STORAGE_STATE), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
