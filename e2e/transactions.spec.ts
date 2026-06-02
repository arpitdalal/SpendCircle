import { expect, test } from "@playwright/test";

/**
 * TRUE-E2E (ADR 0019): record a Transaction through the real frontend → Convex
 * `createTransaction` mutation → DB → reactive `listTransactions` render path,
 * with the injected backend session (no OAuth). Exercises TXN-1's critical flow
 * end to end against the self-hosted backend.
 *
 * Transactions need ≥1 active Category of the matching type, so the test first
 * creates one (CAT-1's flow) in the Personal Circle every bootstrapped User
 * already has — no Circle-creation UI (CS-0) required. Names are unique per run
 * because the self-hosted backend persists across specs.
 */
test("a member records an expense and sees it in the live list", async ({ page }) => {
  const stamp = Date.now();
  const categoryName = `E2E Cat ${stamp}`;
  const title = `E2E Lunch ${stamp}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  await page.getByRole("link", { name: /Personal/ }).click();

  // Seed an expense Category to attach.
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  // Record the expense.
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await page.getByRole("button", { name: "Add expense" }).click();

  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("12.50");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();

  // The reactive query flips to include the new Transaction with no reload.
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText("12.50");
});

test("the expense form blocks submit and explains a missing category", async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E NoCat ${stamp}`;

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add expense" }).click();

  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("5.00");

  // Submit is attemptable (no guessing why it's greyed out): pressing it with no
  // category reveals the requirement and creates nothing (the server enforces ≥1 too).
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(form.getByText("Pick at least one category")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
});
