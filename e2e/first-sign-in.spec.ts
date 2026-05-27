import { expect, test } from "@playwright/test";

test("first sign-in creates and renames Personal Circle", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Ada's Personal Circle" })).toBeVisible();
  await expect(page.getByText("App Version 0.1.0")).toBeVisible();

  await page.getByLabel("Circle name", { exact: true }).fill("Solo Ledger");
  await page.getByRole("button", { name: "Rename Circle" }).click();
  await expect(page.getByRole("heading", { name: "Solo Ledger" })).toBeVisible();

  await page.getByLabel("New Circle name").fill("Home");
  await page.getByLabel("Residence type").selectOption("leased");
  await page.getByRole("button", { name: "Create Circle" }).click();

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Rent, Groceries, Paycheck")).toBeVisible();
});
