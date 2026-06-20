import type { Page } from "@playwright/test";
import {
  clickCircleChromeTab,
  createRegularCircleAndFinishSetup,
  establishE2ESession,
  expect,
  test,
} from "./fixtures.js";

const E2E_PASSWORD = "e2e-Password-123";

async function seedMemberOnCurrentCircle(page: Page, email: string, displayName: string) {
  return page.evaluate(
    async ([memberEmail, memberName]) => {
      const helper = Reflect.get(globalThis, "__scE2E");
      if (typeof helper !== "object" || helper === null) {
        throw new Error("missing __scE2E");
      }
      const seed = Reflect.get(helper, "seedActiveMember");
      if (typeof seed !== "function") {
        throw new Error("missing seedActiveMember");
      }
      return Reflect.apply(seed, helper, [memberEmail, memberName]);
    },
    [email, displayName],
  ) as Promise<{ memberId: string }>;
}

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
  await page.getByRole("link", { name: /Your Circle/ }).click();

  await clickCircleChromeTab(page, "Members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

  // The Personal Circle is always solo: exactly one Member, who is the Owner.
  const rows = page.getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("E2E Tester");
  await expect(rows.first().getByText("Owner", { exact: true })).toBeVisible();
});

test("an owner transfers ownership and owner-only actions follow the new owner", async ({
  page,
  browser,
  baseURL,
}) => {
  const stamp = Date.now();
  const newOwnerEmail = `e2e-transfer-new-${stamp}@example.com`;
  const circleName = `E2E Transfer ${stamp}`;

  const newOwnerContext = await browser.newContext();
  const newOwnerPage = await newOwnerContext.newPage();
  await establishE2ESession(newOwnerPage, {
    baseURL: baseURL ?? "http://127.0.0.1:5173",
    email: newOwnerEmail,
    password: E2E_PASSWORD,
  });

  await createRegularCircleAndFinishSetup(page, { name: circleName });
  const circleUrl = page.url();
  await seedMemberOnCurrentCircle(page, newOwnerEmail, "Maya Member");

  await clickCircleChromeTab(page, "Members");
  const transferForm = page.getByRole("region", { name: "Transfer ownership" });
  await transferForm.getByRole("combobox", { name: "Transfer to member" }).click();
  await page.getByRole("option", { name: "Maya Member" }).click();
  await page.getByRole("button", { name: "Confirm transfer ownership to Maya Member" }).click();

  await expect(page.getByRole("status", { name: "Ownership transfer result" })).toContainText(
    "Ownership transferred to Maya Member",
  );
  await expect(page.getByRole("listitem").filter({ hasText: "Maya Member" })).toContainText(
    "Owner",
  );
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Tester" })).not.toContainText(
    "Owner",
  );
  await expect(page.getByRole("form", { name: "Invite member" })).toHaveCount(0);

  await newOwnerPage.goto(circleUrl);
  await clickCircleChromeTab(newOwnerPage, "Members");
  await expect(newOwnerPage.getByRole("form", { name: "Invite member" })).toBeVisible();

  await newOwnerContext.close();
});
