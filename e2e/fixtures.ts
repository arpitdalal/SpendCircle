import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

const SM_BREAKPOINT_PX = 640;

export type CircleChromeTab = "Dashboard" | "Transactions" | "Search" | "Categories" | "Members";

/**
 * Circle tab navigation: desktop horizontal tabs vs mobile bottom bar + More sheet
 * (issue #124). Use instead of bare `getByRole("link", { name: … })` for Circle chrome.
 */
export async function clickCircleChromeTab(page: Page, tab: CircleChromeTab) {
  const width = page.viewportSize()?.width ?? SM_BREAKPOINT_PX;
  if (width >= SM_BREAKPOINT_PX) {
    await page
      .getByRole("navigation", { name: "Circle tabs" })
      .getByRole("link", { name: tab, exact: true })
      .click();
    return;
  }
  if (tab === "Dashboard" || tab === "Transactions" || tab === "Search") {
    await page
      .getByRole("navigation", { name: "Circle" })
      .getByRole("link", { name: tab, exact: true })
      .click();
    return;
  }
  await page
    .getByRole("navigation", { name: "Circle" })
    .getByRole("button", { name: "More" })
    .click();
  await page
    .getByRole("dialog", { name: "More" })
    .getByRole("link", { name: tab, exact: true })
    .click();
}

/**
 * Pick from a "Categories" combobox inside `scope` (a form or filter dialog).
 * Base UI portals options to `body`; never scope the option lookup to `scope`.
 */
export async function pickFormCategory(page: Page, scope: Locator, name: string) {
  await scope.getByRole("combobox", { name: "Categories" }).click();
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
}

/**
 * Create a Category through the dedicated new-Category route (issue #96; revised #138):
 * from the Categories list, the "New category" CTA opens the create page, submit creates it
 * and navigates back to the list (its `returnTo`). The form now carries an in-form
 * Expense/Income toggle (not a list tab), so this opens the create page directly and flips
 * the toggle to Income when needed. The caller asserts the resulting row if it needs to —
 * kept out of here so pagination-sensitive specs don't wait on a row that may land on a
 * later page. Assumes the Categories surface is already showing.
 */
export async function createCategoryViaForm(
  page: Page,
  { name, type = "expense", color }: { name: string; type?: "expense" | "income"; color?: string },
) {
  await page.getByRole("link", { name: "New category" }).click();
  // Scope EVERY interaction to the create form (its `aria-label` landmark). The list and
  // the form both expose a `Type` group with an Expense/Income toggle, so an unscoped
  // locator can hit the list filter while React Router is still committing the `/new`
  // route. Resolving through the form locator auto-waits for the form to mount first.
  const form = page.getByRole("form", { name: "New category" });
  if (type === "income") {
    await form.getByRole("group", { name: "Type" }).getByRole("button", { name: "Income" }).click();
  }
  await form.getByLabel(new RegExp(`New ${type} category`)).fill(name);
  if (color) {
    await form.getByRole("button", { name: color }).click();
  }
  await form.getByRole("button", { name: "Add category" }).click();
  // Success navigates back to the categories list (returnTo); the page leaves `/new`.
  await page.waitForURL(/\/categories(?:\?|$)/);
}

const e2eDir = dirname(fileURLToPath(import.meta.url));

const E2E_PASSWORD = "e2e-Password-123";

/**
 * Drive the flag-gated email+password test-auth bypass (ADR 0019) on `page` until it
 * lands authenticated on the app shell. Signs up (first run for a unique email) then
 * signs in via `window.__scE2E`, leaving a REAL Better Auth session in the page's
 * context — exactly what the per-worker fixture below captures as `storageState`, and
 * what the sign-out spec drives directly in a throwaway context so it can revoke a
 * session without clobbering the worker's shared one.
 */
export async function establishE2ESession(
  page: Page,
  opts: { baseURL: string; email: string; password?: string },
) {
  const password = opts.password ?? E2E_PASSWORD;

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

  let signInResult: string | undefined;
  try {
    signInResult = await page.evaluate(
      async ([e, p]) => {
        const helper = Reflect.get(globalThis, "__scE2E");
        if (typeof helper !== "object" || helper === null) {
          return "error: missing __scE2E";
        }
        const signIn = Reflect.get(helper, "signIn");
        if (typeof signIn !== "function") {
          return "error: bad signIn";
        }
        try {
          await Reflect.apply(signIn, helper, [e, p]);
          return "ok";
        } catch (err) {
          return `error: ${String(err instanceof Error ? err.message : err)}`;
        }
      },
      [opts.email, password],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Better Auth can reload mid-sign-in; awaiting the in-page promise then loses
    // the realm → Playwright throws here. Continue: locator wait below survives nav.
    if (!msg.includes("Execution context was destroyed")) {
      throw err;
    }
  }
  if (signInResult !== undefined && signInResult !== "ok") {
    throw new Error(`E2E sign-in failed: ${signInResult}`);
  }

  await page.goto(opts.baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your circles" }).waitFor({ timeout: 30_000 });
}

async function signUpUserAndSaveStorageState(opts: {
  baseURL: string;
  workerIndex: number;
  browser: Browser;
}) {
  const email = `e2e+w${opts.workerIndex}-${Date.now()}@example.com`;
  const storagePath = join(e2eDir, ".auth", `worker-${opts.workerIndex}.json`);

  const page = await opts.browser.newPage();
  try {
    await establishE2ESession(page, { baseURL: opts.baseURL, email });
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
    // Cold Convex + 5 parallel worker sign-ups can exceed default 30s fixture budget.
    { scope: "worker", timeout: 120_000 },
  ],
});

export { expect };
