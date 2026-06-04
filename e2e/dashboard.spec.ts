import { expect, test } from "@playwright/test";

/**
 * RPT-3 true-E2E (ADR 0019): the per-Circle Dashboard (the Circle index route) shows
 * the current month's totals and a recent-Transactions feed, with a Paid By filter —
 * all against the real self-hosted backend through the real `getDashboard` /
 * `getPaidByFilterOptions` queries and the injected backend session (no OAuth).
 *
 * The suite runs `fullyParallel` and both projects share one Personal Circle (global
 * setup mints a single User per run), so current-month totals are nondeterministic —
 * other specs record into the same month. So this asserts the Dashboard SURFACE rather
 * than exact totals: the just-recorded Transaction (the newest by record time) appears
 * in the recent feed, and the Paid By filter is present and operable. A unique title
 * per run/project keeps the assertion isolated from the other specs' rows.
 */
test("the dashboard shows recent activity and a working Paid By filter", async ({
  page,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const categoryName = `E2E D ${stamp}`; // keep ≤ 40 chars (categoryNameMax)
  const title = `E2E Dash ${stamp}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  await page.getByRole("link", { name: /Personal/ }).click();

  // Seed an expense Category to attach (CAT-1's flow).
  await page.getByRole("link", { name: "Categories" }).click();
  await page.getByLabel(/New expense category/).fill(categoryName);
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: categoryName })).toBeVisible();

  // Record an expense into the current month (the form defaults the date to today).
  await page.getByRole("link", { name: "Transactions" }).click();
  await page.getByRole("button", { name: "Add expense" }).click();
  const form = page.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("18.25");
  await form.getByRole("button", { name: categoryName }).click();
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  // The Dashboard is the Circle index tab. Its recent feed reflects the new
  // Transaction (newest by record time) with no reload.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const recent = page.getByRole("region", { name: /recent activity/i });
  const row = recent.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText("18.25");

  // The Paid By filter exists and is operable. Narrowing to the sole current Member
  // (Paid By defaults to the recorder) keeps the Transaction visible; back to All too.
  const filter = page.getByLabel(/paid by/i);
  await expect(filter).toBeVisible();
  await filter.selectOption({ index: 1 });
  await expect(recent.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await filter.selectOption("");
  await expect(recent.getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
