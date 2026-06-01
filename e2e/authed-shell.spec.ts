import { expect, test } from "@playwright/test";

/**
 * TRUE-E2E smoke (ADR 0019): with storageState from global-setup, the app loads
 * already authenticated against the REAL self-hosted backend. This exercises the
 * real session → real `listMyCircles` query → render path (no fixtures), proving
 * the frontend↔backend contract end to end.
 */
test("authenticated shell renders the real Personal Circle from the backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  // Every freshly-bootstrapped User gets a Personal Circle (onCreateUser).
  await expect(page.getByRole("link", { name: /Personal/ })).toBeVisible();
});

test("unknown deep links fall back to the safe route (real backend)", async ({ page }) => {
  await page.goto("/this/path/does/not/exist");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
});
