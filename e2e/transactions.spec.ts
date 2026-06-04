import { expect, type Page, test } from "@playwright/test";

/**
 * Select a Ledger month through the native month input the way the UI commits it:
 * set the value, then blur. The Ledger commits the chosen month on BLUR (not per
 * keystroke) so a multi-keystroke year is entered whole and never pushes junk history
 * for the transient values the year segment emits while filling; `fill` alone sets the
 * value without committing it to the URL/ledger.
 */
async function selectMonth(page: Page, month: string) {
  const input = page.getByLabel("Month", { exact: true });
  await input.fill(month);
  await input.blur();
}

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
  await selectMonth(page, ledger.month);
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
  await selectMonth(page, "2000-06");
  await expect(page.getByText("No transactions in June 2000.")).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(totals).toContainText("$0.00");

  // Navigate back and the expense + its total are there again.
  await selectMonth(page, ledger.month);
  await expect(row).toBeVisible();
  await expect(totals).toContainText("-$12.50");
});

/**
 * Regression (TXN-5): typing a multi-digit year into the native month input must
 * register the WHOLE year. The input was controlled straight off the async URL state,
 * so each keystroke of a 4-digit year re-rendered with the not-yet-updated month and
 * snapped the half-typed year segment back — only the first digit or two survived. This
 * types the date digit-by-digit (NOT `fill`, which sets the value atomically and hid the
 * bug in both jsdom and Playwright) and asserts the full year lands. A private far-future
 * month per project keeps the parallel runs from colliding.
 */
test("the month input registers a whole multi-digit year typed digit-by-digit", async ({
  page,
}, testInfo) => {
  const target =
    testInfo.project.name === "mobile-chromium"
      ? { value: "2997-08", label: "August 2997" }
      : { value: "2997-07", label: "July 2997" };
  const [year, mm] = target.value.split("-");

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}/);

  // Drive the native segments with real, separate keystrokes — the exact path that lost
  // digits before (NOT `fill`, which sets the value atomically and hid the bug). Focus
  // lands on the month segment; type MM, step to the year segment, then type the 4-digit
  // year digit-by-digit so a reset of the year buffer would surface as a dropped year.
  const input = page.getByLabel("Month", { exact: true });
  await input.focus();
  await input.pressSequentially(mm, { delay: 50 });
  await input.press("ArrowRight");
  await input.pressSequentially(year, { delay: 50 });
  await input.blur();

  await expect(page).toHaveURL(new RegExp(`month=${target.value}`));
  await expect(input).toHaveValue(target.value);
  await expect(page.getByText(`No transactions in ${target.label}.`)).toBeVisible();
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

  // Edit: open the canonical edit object route (TXN-5), change the title + amount,
  // save, and see the row update live back on the ledger.
  await row.getByRole("link", { name: `Edit ${title}` }).click();
  await expect(page).toHaveURL(/\/transactions\/[^/]+\/edit\?month=/);
  const editForm = page.getByRole("form", { name: /edit transaction/i });
  await editForm.getByLabel("Title").fill(editedTitle);
  await editForm.getByLabel(/Amount/).fill("25.00");
  await editForm.getByRole("button", { name: "Save changes" }).click();

  const editedRow = page.getByRole("listitem").filter({ hasText: editedTitle });
  await expect(editedRow).toBeVisible();
  await expect(editedRow).toContainText("-$25.00"); // still an expense, new amount

  // Type Change: switch to Income — confirm, re-pick the income category, save.
  await editedRow.getByRole("link", { name: `Edit ${editedTitle}` }).click();
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

/**
 * TXN-3 true-E2E: archive then restore a Transaction through the real frontend →
 * `archiveTransaction` / `restoreTransaction` mutations → DB → reactive list. An
 * archived Transaction leaves the active Ledger and appears (frozen — no Edit) in the
 * Archived view; restoring returns it to the active list. A private far-future month
 * per project keeps the parallel runs from colliding on the shared Personal Circle.
 */
test("a member archives and restores a transaction", async ({ page }, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const categoryName = `E2E A ${stamp}`; // ≤ 40 chars (categoryNameMax)
  const title = `E2E Archive ${stamp}`;
  const month = testInfo.project.name === "mobile-chromium" ? "2996-06" : "2996-05";

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  // Record an expense into the private month.
  await page.getByRole("link", { name: "Transactions" }).click();
  await selectMonth(page, month);
  await page.getByRole("button", { name: "Add expense" }).click();
  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("8.00");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();

  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();

  // Archive it — the reactive active list drops it with no reload.
  await row.getByRole("button", { name: `Archive ${title}` }).click();
  await expect(row).toHaveCount(0);

  // It surfaces in the Archived view, frozen (no Edit), with a Restore action.
  await page.getByRole("button", { name: "Archived" }).click();
  await expect(page).toHaveURL(new RegExp(`view=archived`));
  const archivedRow = page.getByRole("listitem").filter({ hasText: title });
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow.getByRole("link", { name: `Edit ${title}` })).toHaveCount(0);

  // Restore it — it leaves the Archived view and returns to the active list.
  await archivedRow.getByRole("button", { name: `Restore ${title}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  await page.getByRole("button", { name: "Active" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

/**
 * TXN-5 true-E2E: the Transactions page is URL-restorable. The selected Monthly Ledger
 * month, the Add form, and an edit deep link all survive a full reload — proving the
 * URL (not transient React state) owns navigation (ADR 0017) against the real router
 * and self-hosted backend. Uses a private far-future month per project so the parallel
 * runs never collide on the shared Personal Circle.
 */
test("the transactions page restores month, add form, and edit link across reload", async ({
  page,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const categoryName = `E2E U ${stamp}`; // ≤ 40 chars (categoryNameMax)
  const title = `E2E URL ${stamp}`;
  const month = testInfo.project.name === "mobile-chromium" ? "2998-04" : "2998-03";

  await page.goto("/");
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  // A bare Transactions route normalizes to a month in the URL.
  await page.getByRole("link", { name: "Transactions" }).click();
  await expect(page).toHaveURL(/\/transactions\?month=\d{4}-\d{2}/);

  // Select the private month; the URL owns it and survives reload.
  await selectMonth(page, month);
  await expect(page).toHaveURL(new RegExp(`month=${month}`));
  await page.reload();
  await expect(page.getByLabel("Month", { exact: true })).toHaveValue(month);

  // Opening Add expense deep-links new=expense and the form survives reload.
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${month}&new=expense`));
  await page.reload();
  await expect(page.getByRole("form", { name: /add expense/i })).toBeVisible();

  // Record into the private month, then open its edit deep link and reload it.
  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("9.00");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();

  const row = page.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: `Edit ${title}` }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions/[^/]+/edit\\?month=${month}`));
  // The edit form is fetched by id, so a reload reopens it on the latest server values.
  await page.reload();
  await expect(
    page.getByRole("form", { name: /edit transaction/i }).getByLabel("Title"),
  ).toHaveValue(title);

  // Closing returns to the ledger with the same month preserved.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`/transactions\\?month=${month}`));
  await expect(row).toBeVisible();
});
