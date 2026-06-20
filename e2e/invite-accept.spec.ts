import type { Page } from "@playwright/test";
import type { Circle, Member } from "../apps/web-app/app/lib/data.js";
import { testId } from "../apps/web-app/app/test/convex/ids.js";
import {
  clickCircleChromeTab,
  createRegularCircleAndFinishSetup,
  establishE2ESession,
  expect,
  test,
} from "./fixtures.js";

function circleIdFromUrl(url: string): Circle["id"] {
  const ref = url.match(/\/circles\/([^/?#]+)/)?.[1];
  if (!ref) {
    throw new Error("could not parse circle ref from url");
  }
  const lastDash = ref.lastIndexOf("-");
  return testId<Circle["id"]>(lastDash === -1 ? ref : ref.slice(lastDash + 1));
}

async function inviteByEmail(page: Page, email: string) {
  await clickCircleChromeTab(page, "Members");
  const form = page.getByRole("form", { name: "Invite member" });
  await form.getByLabel("Email address").fill(email);
  await form.getByRole("button", { name: "Invite member" }).click();
  await expect(form.getByRole("status")).toHaveText(/invitation created/i);
  const inviteLink = await form.getByLabel("Invitation link").inputValue();
  const token = inviteLink.split("/invite/")[1];
  if (!token) {
    throw new Error("invite link missing token");
  }
  return token;
}

async function acceptInviteAs(page: Page, token: string) {
  await page.goto(`/invite/${token}`);
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.waitForURL(/\/circles\/[^/]+-[^/]+(?:\/|$)/);
}

async function listMembers(page: Page, circleId: Circle["id"]) {
  return page.evaluate(async (id) => {
    const helper = Reflect.get(globalThis, "__scE2E") as {
      listMembers?: (
        circleId: Circle["id"],
      ) => Promise<Array<{ id: Member["id"]; displayName: string; role: string }>>;
    };
    if (!helper?.listMembers) {
      throw new Error("missing __scE2E.listMembers");
    }
    return helper.listMembers(id);
  }, circleId);
}

/**
 * TRUE-E2E (ADR 0019): invitation accept through the real frontend → Convex
 * `acceptInvitation` / `getInvitationPreview` path against the self-hosted backend.
 */
test("an invited user accepts and lands in the Circle member list", async ({
  browser,
  baseURL,
}) => {
  const resolvedBase = typeof baseURL === "string" && baseURL ? baseURL : "http://127.0.0.1:5173";
  const circleName = `Invite Circle ${Date.now()}`;
  const inviteeEmail = `e2e+invite-${Date.now()}@example.com`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    await establishE2ESession(ownerPage, {
      baseURL: resolvedBase,
      email: `e2e+owner-${Date.now()}@example.com`,
    });
    await createRegularCircleAndFinishSetup(ownerPage, { name: circleName });
    const token = await inviteByEmail(ownerPage, inviteeEmail);

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    try {
      await establishE2ESession(inviteePage, {
        baseURL: resolvedBase,
        email: inviteeEmail,
      });
      await acceptInviteAs(inviteePage, token);

      await clickCircleChromeTab(ownerPage, "Members");
      await expect(ownerPage.getByRole("listitem")).toHaveCount(2);
      await expect(ownerPage.getByText("E2E Tester")).toHaveCount(2);
    } finally {
      await inviteeContext.close();
    }
  } finally {
    await ownerContext.close();
  }
});

test("a removed member rejoins through a fresh invitation on the same member row", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const resolvedBase = typeof baseURL === "string" && baseURL ? baseURL : "http://127.0.0.1:5173";
  const circleName = `Rejoin Circle ${Date.now()}`;
  const inviteeEmail = `e2e+rejoin-${Date.now()}@example.com`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    await establishE2ESession(ownerPage, {
      baseURL: resolvedBase,
      email: `e2e+rejoin-owner-${Date.now()}@example.com`,
    });
    await createRegularCircleAndFinishSetup(ownerPage, { name: circleName });
    const firstToken = await inviteByEmail(ownerPage, inviteeEmail);

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    try {
      await establishE2ESession(inviteePage, {
        baseURL: resolvedBase,
        email: inviteeEmail,
      });
      await acceptInviteAs(inviteePage, firstToken);
      const circleId = circleIdFromUrl(inviteePage.url());
      await clickCircleChromeTab(ownerPage, "Members");
      const membersAfterJoin = await listMembers(ownerPage, circleId);
      const inviteeMemberId = membersAfterJoin.find((member) => member.role === "member")?.id;
      if (!inviteeMemberId) {
        throw new Error("invitee member id missing");
      }

      await ownerPage.evaluate(
        async ([id, memberId]) => {
          const helper = Reflect.get(globalThis, "__scE2E") as {
            markMemberRemoved?: (circleId: Circle["id"], memberId: Member["id"]) => Promise<void>;
          };
          if (!helper?.markMemberRemoved) {
            throw new Error("missing __scE2E.markMemberRemoved");
          }
          await helper.markMemberRemoved(id, memberId);
        },
        [circleId, inviteeMemberId],
      );

      const membersAfterRemove = await listMembers(ownerPage, circleId);
      expect(membersAfterRemove.filter((member) => member.role === "member")).toHaveLength(0);

      const reinviteToken = await inviteByEmail(ownerPage, inviteeEmail);
      await acceptInviteAs(inviteePage, reinviteToken);

      const membersAfterRejoin = await listMembers(ownerPage, circleId);
      expect(membersAfterRejoin.map((member) => member.id).sort()).toEqual(
        membersAfterJoin.map((member) => member.id).sort(),
      );
      await clickCircleChromeTab(ownerPage, "Members");
      await expect(ownerPage.getByRole("listitem")).toHaveCount(2);
    } finally {
      await inviteeContext.close();
    }
  } finally {
    await ownerContext.close();
  }
});

test("a signed-in user with the wrong email sees a generic accept error", async ({
  browser,
  baseURL,
}) => {
  const resolvedBase = typeof baseURL === "string" && baseURL ? baseURL : "http://127.0.0.1:5173";
  const circleName = `Wrong Email ${Date.now()}`;
  const invitedEmail = `e2e+invited-${Date.now()}@example.com`;

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    await establishE2ESession(ownerPage, {
      baseURL: resolvedBase,
      email: `e2e+wrong-owner-${Date.now()}@example.com`,
    });
    await createRegularCircleAndFinishSetup(ownerPage, { name: circleName });
    const token = await inviteByEmail(ownerPage, invitedEmail);

    const wrongContext = await browser.newContext();
    const wrongPage = await wrongContext.newPage();
    try {
      await establishE2ESession(wrongPage, {
        baseURL: resolvedBase,
        email: `e2e+wrong-${Date.now()}@example.com`,
      });
      await wrongPage.goto(`${resolvedBase}/invite/${token}`);
      await wrongPage.getByRole("button", { name: "Accept invitation" }).click();
      await expect(wrongPage.getByRole("alert")).toHaveText("Something went wrong");

      await clickCircleChromeTab(ownerPage, "Members");
      await expect(ownerPage.getByRole("listitem")).toHaveCount(1);
    } finally {
      await wrongContext.close();
    }
  } finally {
    await ownerContext.close();
  }
});
