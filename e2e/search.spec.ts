import { expect, test } from "@playwright/test";

test("transaction search finds circle transactions across months and opens detail", async ({
  page,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const categoryName = `E2E S ${stamp}`;
  const title = `E2E Search ${stamp}`;
  const month = testInfo.project.name === "mobile-chromium" ? "2993-06" : "2993-05";

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  const monthInput = page.getByLabel("Month", { exact: true });
  await monthInput.fill(month);
  await monthInput.blur();

  await page.getByRole("button", { name: "Add expense" }).click();
  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("14.00");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  await page.getByRole("link", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?type=all&status=all/);
  await page.getByRole("searchbox", { name: "Search title or note" }).fill(title);
  await page.getByRole("button", { name: "Search" }).click();
  const result = page.getByRole("listitem").filter({ hasText: title });
  await expect(result).toBeVisible();

  await page.getByRole("button", { name: /Filters/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await dialog.getByRole("button", { name: "Expense" }).click();
  await dialog.getByLabel("From").fill(`${month}-01`);
  await dialog.getByLabel("To").fill(`${month}-28`);
  await dialog.getByLabel("Amount min").fill("14.00");
  await dialog.getByLabel("Amount max").fill("14.00");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/type=expense/);
  await expect(page).toHaveURL(/min=14.00/);
  await expect(result).toBeVisible();

  await result.getByRole("link", { name: `View ${title}` }).click();
  await expect(page).toHaveURL(/\/transactions\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
