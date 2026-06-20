import type { Page } from "@playwright/test";
import {
  clickCircleChromeTab,
  createRegularCircleAndFinishSetup,
  establishE2ESession,
  expect,
  pickFormCategory,
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

async function callRemoveMember(page: Page, memberId: string) {
  return page.evaluate(async (id) => {
    const helper = Reflect.get(globalThis, "__scE2E");
    if (typeof helper !== "object" || helper === null) {
      throw new Error("missing __scE2E");
    }
    const remove = Reflect.get(helper, "removeMember");
    if (typeof remove !== "function") {
      throw new Error("missing removeMember");
    }
    try {
      await Reflect.apply(remove, helper, [id]);
      return { ok: true as const };
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : String(err),
        data:
          err && typeof err === "object" && "data" in err
            ? (err as { data: unknown }).data
            : undefined,
      };
    }
  }, memberId);
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

test("an owner removes a member and the row disappears from the list", async ({
  page,
  browser,
  baseURL,
}) => {
  const stamp = Date.now();
  const memberEmail = `e2e-remove-member-${stamp}@example.com`;
  const circleName = `E2E Remove ${stamp}`;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await establishE2ESession(memberPage, {
    baseURL: baseURL ?? "http://127.0.0.1:5173",
    email: memberEmail,
    password: E2E_PASSWORD,
  });
  await memberContext.close();

  await createRegularCircleAndFinishSetup(page, { name: circleName });
  await seedMemberOnCurrentCircle(page, memberEmail, "Maya Member");

  await clickCircleChromeTab(page, "Members");
  await expect(page.getByRole("listitem").filter({ hasText: "Maya Member" })).toBeVisible();

  await page.getByRole("button", { name: "Remove Maya Member" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();

  await expect(page.getByRole("listitem").filter({ hasText: "Maya Member" })).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});

test("a non-owner member does not see remove buttons", async ({ page, browser, baseURL }) => {
  const stamp = Date.now();
  const memberEmail = `e2e-no-remove-${stamp}@example.com`;
  const circleName = `E2E No Remove ${stamp}`;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await establishE2ESession(memberPage, {
    baseURL: baseURL ?? "http://127.0.0.1:5173",
    email: memberEmail,
    password: E2E_PASSWORD,
  });

  await createRegularCircleAndFinishSetup(page, { name: circleName });
  const circleUrl = page.url();
  await seedMemberOnCurrentCircle(page, memberEmail, "Maya Member");

  await memberPage.goto(circleUrl);
  await clickCircleChromeTab(memberPage, "Members");
  await expect(memberPage.getByRole("heading", { name: "Members" })).toBeVisible();
  await expect(memberPage.getByRole("button", { name: /Remove / })).toHaveCount(0);

  await memberContext.close();
});

test("removeMember as a non-owner returns the coded forbidden error", async ({
  page,
  browser,
  baseURL,
}) => {
  const stamp = Date.now();
  const memberEmail = `e2e-forbidden-${stamp}@example.com`;
  const circleName = `E2E Forbidden ${stamp}`;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await establishE2ESession(memberPage, {
    baseURL: baseURL ?? "http://127.0.0.1:5173",
    email: memberEmail,
    password: E2E_PASSWORD,
  });

  await createRegularCircleAndFinishSetup(page, { name: circleName });
  const { memberId } = await seedMemberOnCurrentCircle(page, memberEmail, "Maya Member");
  await seedMemberOnCurrentCircle(page, `e2e-other-${stamp}@example.com`, "Other Member");

  await memberPage.goto(page.url());
  const result = await callRemoveMember(memberPage, memberId);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).toContain("member.removeForbidden");

  await memberContext.close();
});

test("a removed member's transactions still show their frozen display name", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const stamp = `${Date.now()}-${testInfo.project.name}`;
  const memberEmail = `e2e-frozen-${stamp}@example.com`;
  const circleName = `E2E Frozen ${stamp}`;
  const categoryName = `E2E Cat ${stamp}`;
  const title = `E2E Frozen Txn ${stamp}`;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await establishE2ESession(memberPage, {
    baseURL: baseURL ?? "http://127.0.0.1:5173",
    email: memberEmail,
    password: E2E_PASSWORD,
  });

  await createRegularCircleAndFinishSetup(page, { name: circleName });
  const circleUrl = page.url();
  await seedMemberOnCurrentCircle(page, memberEmail, "Maya Member");

  await memberPage.goto(circleUrl);
  await clickCircleChromeTab(memberPage, "Categories");
  await memberPage.getByRole("link", { name: "New category" }).click();
  const categoryForm = memberPage.getByRole("form", { name: "New category" });
  await categoryForm.getByLabel(/New expense category/).fill(categoryName);
  await categoryForm.getByRole("button", { name: "Add category" }).click();
  await memberPage.waitForURL(/\/categories(?:\?|$)/);

  await clickCircleChromeTab(memberPage, "Transactions");
  await memberPage.getByRole("link", { name: "Add expense" }).click();
  const form = memberPage.getByRole("form", { name: /add expense/i });
  await form.getByLabel("Title").fill(title);
  await form.getByLabel(/Amount/).fill("9.99");
  await pickFormCategory(memberPage, form, categoryName);
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(memberPage.getByRole("listitem").filter({ hasText: title })).toBeVisible();

  await page.goto(circleUrl);
  await clickCircleChromeTab(page, "Members");
  await page.getByRole("button", { name: "Remove Maya Member" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Maya Member" })).toHaveCount(0);

  await clickCircleChromeTab(page, "Transactions");
  const item = page.getByRole("listitem").filter({ hasText: title });
  await expect(item).toBeVisible();
  await expect(item).toContainText("Maya Member");

  await memberContext.close();
});
