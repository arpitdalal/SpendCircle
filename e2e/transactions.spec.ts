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
 * AND per project: the suite shares one signed-in User (so one Personal Circle)
 * across the parallel desktop/mobile projects, and a bare `Date.now()` can collide
 * across the two workers — the project name keeps each test's rows distinct.
 */
test("a member records an expense and sees it in the live list", async ({ page }, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
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

test("the expense form blocks submit and explains a missing category", async ({
  page,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
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

/**
 * RPT-1 true-E2E: the Monthly Ledger shows ONE selected month — the month's totals
 * (computed server-side by `getMonthlyLedger`) and that month's Transactions — with
 * month navigation, all against the real backend.
 *
 * Totals are asserted EXACTLY, which the shared current month can't support: the suite
 * runs `fullyParallel` and both projects share one Personal Circle (global-setup mints a
 * single User per run), and another spec records income there, so the current month's net
 * is nondeterministic. Instead each project records into its OWN far-future month — empty
 * at run start (the User is fresh) and never written by any other spec — so the month's
 * totals are exactly this test's one expense. Navigating the create into that month relies
 * on the form defaulting its date to the selected month.
 */
test("the monthly ledger totals a month and navigates between months", async ({
  page,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const categoryName = `E2E L ${stamp}`; // keep ≤ 40 chars (categoryNameMax)
  const title = `E2E Ledger ${stamp}`;
  // A private month per project (see playwright.config projects) so the two parallel
  // runs against the shared Personal Circle never share a month's totals.
  const ledger =
    testInfo.project.name === "mobile-chromium"
      ? { month: "2999-11", label: "November 2999" }
      : { month: "2999-10", label: "October 2999" };

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  // Select the private month FIRST — it starts empty, so server totals are zero, and the
  // create form will default its date into this month.
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByLabel("Month", { exact: true }).fill(ledger.month);
  await expect(page.getByText(`No transactions in ${ledger.label}.`)).toBeVisible();
  const totals = page.getByRole("group", { name: "Monthly totals" });
  await expect(totals).toContainText("$0.00");

  // Record an expense into the selected month.
  await page.getByRole("button", { name: "Add expense" }).click();
  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("12.50");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();

  // The row appears and the month's totals reflect exactly this one expense: a -$12.50 Net.
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(totals).toContainText("-$12.50");

  // Jump to a far-past month no spec ever writes to: zero totals, empty list (totals are
  // per-month, not global).
  await page.getByLabel("Month", { exact: true }).fill("2000-06");
  await expect(page.getByText("No transactions in June 2000.")).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(totals).toContainText("$0.00");

  // Navigate back and the expense + its total are there again.
  await page.getByLabel("Month", { exact: true }).fill(ledger.month);
  await expect(row).toBeVisible();
  await expect(totals).toContainText("-$12.50");
});

/**
 * TXN-2 true-E2E: the Recorded By Member edits a saved Transaction through the real
 * frontend → `updateTransaction` mutation → DB → reactive list, and a Type Change
 * (Expense→Income) confirms, clears the old Category, requires re-picking from the
 * new type, and flips the row to income end to end.
 */
test("the recorder edits a transaction and changes its type", async ({ page }, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const expenseCat = `E2E Exp ${stamp}`;
  const incomeCat = `E2E Inc ${stamp}`;
  const title = `E2E Edit ${stamp}`;
  const editedTitle = `${title} edited`;

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();

  // Seed one Category of each type to work with.
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(expenseCat);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: expenseCat })).toBeVisible();
  // The income tab in the Categories surface (CAT-1) — pick income, then add.
  await page.getByRole("tab", { name: "Income" }).click();
  await page.getByLabel(/New income category/).fill(incomeCat);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: incomeCat })).toBeVisible();

  // Record an expense to edit.
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add expense" }).click();
  const addForm = page.getByRole("form", { name: /add expense/i });
  await addForm.getByLabel("Title").fill(title);
  await addForm.getByLabel(/Amount/).fill("10.00");
  await addForm.getByRole("button", { name: expenseCat }).click();
  await addForm.getByRole("button", { name: "Add expense" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();

  // Edit: change the title + amount, save, and see the row update live.
  await row.getByRole("button", { name: `Edit ${title}` }).click();
  const editForm = page.getByRole("form", { name: /edit transaction/i });
  await editForm.getByLabel("Title").fill(editedTitle);
  await editForm.getByLabel(/Amount/).fill("25.00");
  await editForm.getByRole("button", { name: "Save changes" }).click();

  const editedRow = page.getByRole("listitem").filter({ hasText: editedTitle });
  await expect(editedRow).toBeVisible();
  await expect(editedRow).toContainText("-$25.00"); // still an expense, new amount

  // Type Change: switch to Income — confirm, re-pick the income category, save.
  await editedRow.getByRole("button", { name: `Edit ${editedTitle}` }).click();
  const typeForm = page.getByRole("form", { name: /edit transaction/i });
  await typeForm.getByRole("button", { name: "Income" }).click();
  await typeForm.getByRole("alertdialog").getByRole("button", { name: "Change type" }).click();
  // The old expense category is gone; pick the income one before saving.
  await expect(typeForm.getByRole("button", { name: expenseCat })).toHaveCount(0);
  await typeForm.getByRole("button", { name: incomeCat }).click();
  await typeForm.getByRole("button", { name: "Save changes" }).click();

  const incomeRow = page.getByRole("listitem").filter({ hasText: editedTitle });
  await expect(incomeRow).toContainText("+$25.00"); // flipped to income
  await expect(incomeRow).toContainText(incomeCat);
});
