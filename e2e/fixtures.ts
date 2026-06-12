import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

/**
 * Pick from a "Categories" combobox inside `scope` (a form or filter dialog).
 * Base UI portals options to `body`; never scope the option lookup to `scope`.
 */
export async function pickFormCategory(page: Page, scope: Locator, name: string) {
  await scope.getByRole("combobox", { name: "Categories" }).click();
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
}

const e2eDir = dirname(fileURLToPath(import.meta.url));

async function signUpUserAndSaveStorageState(opts: {
  baseURL: string;
  workerIndex: number;
  browser: Browser;
}) {
  const email = `e2e+w${opts.workerIndex}-${Date.now()}@example.com`;
  const password = "e2e-Password-123";
  const storagePath = join(e2eDir, ".auth", `worker-${opts.workerIndex}.json`);

  const page = await opts.browser.newPage();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await page.goto(opts.baseURL, { waitUntil: "domcontentloaded" });
        break;
      } catch (err) {
        if (attempt >= 30) throw err;
        await page.waitForTimeout(1000);
      }
    }

    await page.waitForFunction(() => "__scE2E" in globalThis, { timeout: 30_000 });
    const result = await page.evaluate(
      async ([e, p]) => {
        const helper = Reflect.get(globalThis, "__scE2E");
        if (typeof helper !== "object" || helper === null) {
          return `error: missing __scE2E`;
        }
        const signIn = Reflect.get(helper, "signIn");
        if (typeof signIn !== "function") {
          return `error: bad signIn`;
        }
        try {
          await Reflect.apply(signIn, helper, [e, p]);
          return "ok";
        } catch (err) {
          return `error: ${String(err instanceof Error ? err.message : err)}`;
        }
      },
      [email, password],
    );
    if (result !== "ok") throw new Error(`E2E sign-in failed: ${result}`);

    await page.goto(opts.baseURL, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Your circles" }).waitFor({ timeout: 30_000 });

    await mkdir(dirname(storagePath), { recursive: true });
    await page.context().storageState({ path: storagePath });
    return storagePath;
  } finally {
    await page.close();
  }
}

/**
 * One Better Auth session per Playwright worker (ADR 0019). Each worker gets its
 * own User + Personal Circle so parallel desktop/mobile projects cannot clobber
 * each other's list/total assertions.
 */
export const test = base.extend<object, { workerStorageState: string }>({
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },

  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const raw = workerInfo.project.use.baseURL;
      const resolvedBase =
        typeof raw === "string" && raw.length > 0 ? raw : "http://127.0.0.1:5173";
      const pathToState = await signUpUserAndSaveStorageState({
        baseURL: resolvedBase,
        workerIndex: workerInfo.workerIndex,
        browser,
      });
      await use(pathToState);
    },
    { scope: "worker" },
  ],
});

export { expect };
