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

/**
 * RPT-7 real-backend regression: sparse text matches over more than one source
 * page used to make `filterLedgerTransactions` / `searchTransactions` call
 * `.paginate()` twice in one query execution, which only the real backend
 * rejects. Seed in a dedicated Circle so the >25 rows do not bloat the shared
 * Personal Circle's form pickers.
 */
test("sparse transaction filters spanning multiple source pages do not crash", async ({
  page,
}, testInfo) => {
  test.slow();

  const projectCode = testInfo.project.name === "mobile-chromium" ? "m" : "d";
  const nonce = `${Date.now()}-${projectCode}`;
  const circleName = `E2E Sparse ${nonce}`;
  const categoryName = `E2E SpCat ${nonce}`;
  const month = projectCode === "m" ? "2994-06" : "2994-05";
  const matchingTitle = (index: number) => `E2E Sparse Needle ${index} ${nonce}`;
  const missTitle = (index: number) => `E2E Sparse Miss ${index} ${nonce}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Circles" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Create circle" }).click();
  await page.getByLabel("Name").fill(circleName);
  await page.getByRole("button", { name: "Create circle" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL(/\/circles\/[^/]+-[^/]+$/);

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  await page.getByRole("link", { name: "Transactions" }).click();
  const monthInput = page.getByLabel("Month", { exact: true });
  await monthInput.fill(month);
  await monthInput.blur();

  for (let index = 0; index < 27; index += 1) {
    const day = (index + 1).toString().padStart(2, "0");
    await page.getByRole("button", { name: "Add expense" }).click();
    const form = page.getByRole("form", { name: /add expense/i });
    await form.getByLabel("Title").fill(index % 2 === 0 ? matchingTitle(index) : missTitle(index));
    await form.getByLabel(/Amount/).fill("1.00");
    await form.getByLabel("Date").fill(`${month}-${day}`);
    await form.getByRole("button", { name: categoryName }).click();
    await form.getByRole("button", { name: "Add expense" }).click();
    await expect(form).toHaveCount(0);
  }

  await page.getByRole("button", { name: /Filters/ }).click();
  const ledgerDialog = page.getByRole("dialog", { name: "Filters" });
  await ledgerDialog.getByRole("searchbox", { name: "Search title or note" }).fill("Sparse Needle");
  await ledgerDialog.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=Sparse\+Needle/);
  await expect(page.getByRole("listitem").filter({ hasText: matchingTitle(0) })).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  await page.getByRole("link", { name: "Search", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search title or note" }).fill("Sparse Needle");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=Sparse\+Needle/);
  await expect(page.getByRole("listitem").filter({ hasText: matchingTitle(0) })).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
});
