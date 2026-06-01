import { expect, test } from "@playwright/test";

/**
 * TRUE-E2E (ADR 0019): create a Category through the real frontend → Convex
 * `createCategory` mutation → DB → reactive `listCategories` render path, with
 * the injected backend session (no OAuth). Exercises CAT-1's critical flow end
 * to end against the self-hosted backend.
 *
 * Categories may be created in any Circle the User belongs to, including the
 * Personal Circle (PRD story 48), which every bootstrapped User already has — so
 * this needs no Circle-creation UI (CS-0) to run.
 *
 * The name is unique per run because the self-hosted backend persists across
 * specs and uniqueness is enforced per (Circle, type) including archived names.
 */
test("a member creates a category and sees it in the live list", async ({ page }) => {
  const name = `E2E Groceries ${Date.now()}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  await page.getByLabel(/New expense category/).fill(name);
  // Pick a non-default palette color so the choice is exercised, not the default.
  await page.getByRole("button", { name: "Teal" }).click();
  await page.getByRole("button", { name: "Add category" }).click();

  // The reactive query flips to include the new Category with no reload.
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
});

test("the server rejects a duplicate name inline", async ({ page }) => {
  const name = `E2E Dupe ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();
  await page.getByRole("link", { name: "Categories" }).click();

  const nameField = page.getByLabel(/New expense category/);
  const addButton = page.getByRole("button", { name: "Add category" });

  await nameField.fill(name);
  await addButton.click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  // A case-only duplicate is rejected by the server and surfaced inline.
  await nameField.fill(name.toUpperCase());
  await addButton.click();
  await expect(page.getByRole("alert")).toHaveText(/already exists/i);
});
