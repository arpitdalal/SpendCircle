import { expect, test } from "@playwright/test";

/**
 * TRUE-E2E (ADR 0019): open the Member List through the real frontend → Convex
 * `listMembers` query → DB render path, with the injected backend session (no
 * OAuth). Exercises MEM-1's read-only flow end to end against the self-hosted
 * backend.
 *
 * Every bootstrapped User has a Personal Circle with exactly one Member — the
 * User themselves, as Owner — so this needs no Circle-creation (CS-0) or invite
 * (MEM-2) UI to run. The seeded test User's Display Name is "E2E Tester"
 * (see `installE2EAuthHelper`).
 */
test("a member views the Member List with their own identity and Owner badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  await page.getByRole("link", { name: /Personal/ }).click();

  await page.getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

  // The Personal Circle is always solo: exactly one Member, who is the Owner.
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("E2E Tester");
  await expect(rows.first().getByText("Owner", { exact: true })).toBeVisible();
});
