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

/**
 * CAT-2 critical flow: edit → history → archive → restore through the real
 * frontend → Convex mutations → reactive `listCategories` / `listCategoryHistory`
 * render paths. The injected User owns the Personal Circle, so they are both the
 * Category creator (field edits) and the Owner (moderation) — the permission
 * matrix itself lives in the convex-test suite.
 */
test("a member edits, archives, and restores a category and sees its history", async ({ page }) => {
  const name = `E2E Lifecycle ${Date.now()}`;
  const renamed = `${name} v2`;

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();
  await page.getByRole("link", { name: "Categories" }).click();

  await page.getByLabel(/New expense category/).fill(name);
  await page.getByRole("button", { name: "Add category" }).click();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Rename through the inline edit form; the reactive list updates in place.
  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const editForm = page.getByRole("form", { name: `Edit ${name}` });
  await editForm.getByLabel("Name").fill(renamed);
  await editForm.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: renamed })).toBeVisible();

  // The history panel shows the edit over the create, newest first.
  const historyButton = page.getByRole("button", { name: `History of ${renamed}` });
  await historyButton.click();
  const history = page.getByRole("region", { name: `${renamed} history` });
  await expect(history.getByText("edited")).toBeVisible();
  await expect(history.getByText("created")).toBeVisible();
  // Collapse before archiving so later list assertions see only category rows
  // (the panel renders its own list items inside the row).
  await historyButton.click();
  await expect(history).toHaveCount(0);

  // Archive: the row leaves the default (active-only) list.
  await page.getByRole("button", { name: `Archive ${renamed}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: renamed })).toHaveCount(0);

  // The widened list surfaces it with the badge; restore brings it back active.
  await page.getByRole("switch", { name: "Show archived" }).click();
  const archivedRow = page.getByRole("listitem").filter({ hasText: renamed });
  await expect(archivedRow.getByText("Archived")).toBeVisible();
  await page.getByRole("button", { name: `Restore ${renamed}` }).click();
  await expect(archivedRow.getByText("Archived")).toHaveCount(0);

  // Back on the active-only view the restored category is present again.
  await page.getByRole("switch", { name: "Hide archived" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: renamed })).toBeVisible();
});
