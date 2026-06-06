import { expect, test } from "@playwright/test";

/**
 * TRUE-E2E (ADR 0019): create a regular Circle through the real shell → Convex
 * `createCircle` mutation → DB → canonical-ref navigation, with the injected backend
 * session (no OAuth). Exercises CS-0's critical flow end to end against the self-hosted
 * backend: open the Circle switcher in the shell, create from it, and land on the new
 * Circle's canonical URL.
 *
 * The name is unique per run because the self-hosted backend persists across specs;
 * names may duplicate by design (PRD 10), so this is only to keep assertions specific.
 */
test("a user creates a regular circle from the shell and lands on it", async ({ page }) => {
  const name = `E2E Circle ${Date.now()}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();

  // Open the switcher in the app shell and start the create flow from it.
  await page.getByRole("button", { name: "Circles" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Create circle" }).click();

  await expect(page.getByRole("heading", { name: "Create a circle" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  // Pick a non-default palette color so the choice is exercised, not the default.
  await page.getByRole("button", { name: "Teal" }).click();
  await page.getByRole("button", { name: "Create circle" }).click();

  // Lands on the new Circle's canonical `slug-id` ref (ADR 0016): the Circle header
  // shows the name, and the URL is under /circles/<slug-id>.
  await expect(page.getByRole("heading", { name })).toBeVisible();
  expect(page.url()).toMatch(/\/circles\/[^/]+-[^/]+$/);
  await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible();
});

test("the new circle appears in the switcher and is reachable again", async ({ page }) => {
  const name = `E2E Switch ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Circles" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Create circle" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create circle" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // The reactive `listMyCircles` now includes it: open the switcher and select it.
  await page.getByRole("button", { name: "Circles" }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
