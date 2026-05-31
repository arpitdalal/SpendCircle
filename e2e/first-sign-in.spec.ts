import { expect, test } from "@playwright/test";

// E2E always runs in mock mode (VITE_MOCKS), so the dev auth bypass injects a
// ready session and the app shell renders without driving Google OAuth (ADR 0006).
test("lands on the app shell with the user's circles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Personal/ })).toBeVisible();
});

test("unknown deep links fall back to the safe route", async ({ page }) => {
  await page.goto("/this/path/does/not/exist");
  // The splat route redirects home with the generic unavailable-link snackbar.
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
});
