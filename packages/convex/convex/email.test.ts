import { capturedRequests, HttpResponse, http, resetCapturedRequests } from "@spend-circle/mocks";
import { server } from "@spend-circle/mocks/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import {
  INVITATION_SUBJECT,
  invitationHtml,
  sendEmail,
  WELCOME_SUBJECT,
  welcomeHtml,
} from "./email.js";
import schema from "./schema.js";
import { makeUser, seedCircle, seedPersonalCircleOwner } from "./test/seed.js";

const { mockCurrentUser } = vi.hoisted(() => ({ mockCurrentUser: vi.fn() }));
vi.mock("./auth.js", () => ({
  getCurrentUserOrNull: mockCurrentUser,
  requireCurrentUser: async (ctx: unknown) => {
    const user = await mockCurrentUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    return user;
  },
}));

const modules = import.meta.glob("./**/*.ts");

type TestCtx = ReturnType<typeof convexTest>;

const FINANCIAL_PATTERN = /\$|\bUSD\b|\bEUR\b|\bGBP\b|\bamount\b|\bbalance\b|\d+\.\d{2}/i;

function resendBodyHtml(body: unknown) {
  if (typeof body !== "object" || body === null || !("html" in body)) {
    throw new Error("expected Resend JSON body with html");
  }
  const { html } = body;
  if (typeof html !== "string") {
    throw new Error("expected Resend html field to be a string");
  }
  return html;
}

async function seedOwner(t: TestCtx) {
  const seed = await t.run((ctx) =>
    seedPersonalCircleOwner(ctx, {
      email: "ada@example.com",
      displayName: "Ada Lovelace",
      onboarded: true,
    }),
  );
  mockCurrentUser.mockResolvedValue(seed.owner);
  return seed;
}

async function getWelcomeSentAt(t: TestCtx, userId: Id<"users">) {
  return await t.run(async (ctx) => (await ctx.db.get(userId))?.welcomeSentAt);
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function seedPendingInvitation(
  t: TestCtx,
  opts: { circleName?: string; email?: string } = {},
) {
  const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
  if (opts.circleName) {
    await t.run(async (ctx) => {
      await ctx.db.patch(circleId, { name: opts.circleName });
    });
  }
  const invitationId = await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("invitations", {
      circleId,
      emailLower: opts.email ?? "invitee@example.com",
      tokenHash: "hash-placeholder",
      status: "pending" as const,
      invitedByUserId: owner._id,
      resendCount: 0,
      resendTimestamps: [],
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });
  });
  return { owner, circleId, invitationId };
}

beforeEach(() => {
  mockCurrentUser.mockReset();
  resetCapturedRequests();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("welcomeHtml", () => {
  it("includes the display name and welcome copy with no financial content", () => {
    const html = welcomeHtml("Ada Lovelace");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Welcome to Spend Circle");
    expect(html).toContain("Personal Circle");
    expect(html).not.toMatch(FINANCIAL_PATTERN);
  });
});

describe("welcomePayload", () => {
  it("returns payload for a fresh user", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    const payload = await t.query(internal.email.welcomePayload, { userId });
    expect(payload).toEqual({
      alreadySent: false,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
    });
  });

  it("returns alreadySent after markWelcomed", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.mutation(internal.email.markWelcomed, { userId });

    const payload = await t.query(internal.email.welcomePayload, { userId });
    expect(payload).toEqual({
      alreadySent: true,
      email: "ada@example.com",
      displayName: "Ada Lovelace",
    });
  });

  it("returns null for a deleted user", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(userId);
    });

    const payload = await t.query(internal.email.welcomePayload, { userId });
    expect(payload).toBeNull();
  });
});

describe("markWelcomed", () => {
  it("sets welcomeSentAt once and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.mutation(internal.email.markWelcomed, { userId });
    const sentAt = await getWelcomeSentAt(t, userId);
    expect(sentAt).toBeTypeOf("number");

    await t.mutation(internal.email.markWelcomed, { userId });
    expect(await getWelcomeSentAt(t, userId)).toBe(sentAt);
  });
});

describe("sendWelcomeEmail", () => {
  it("skips Resend and leaves welcomeSentAt unset when already sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);
    await t.mutation(internal.email.markWelcomed, { userId });
    const sentAt = await getWelcomeSentAt(t, userId);

    await t.action(internal.email.sendWelcomeEmail, { userId });

    expect(await getWelcomeSentAt(t, userId)).toBe(sentAt);
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
  });

  it("does not mark when Resend env is unset (no network)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.action(internal.email.sendWelcomeEmail, { userId });

    expect(await getWelcomeSentAt(t, userId)).toBeFalsy();
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
  });

  it("posts the expected payload to Resend and marks on 2xx", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.action(internal.email.sendWelcomeEmail, { userId });

    const resend = capturedRequests.filter((r) => r.vendor === "resend");
    expect(resend).toHaveLength(1);
    expect(resend[0]?.body).toMatchObject({
      from: "no-reply@spendcircle.test",
      to: "ada@example.com",
      subject: WELCOME_SUBJECT,
    });
    expect(resend[0]?.headers?.["idempotency-key"]).toBe(`welcome:${userId}`);
    const html = resendBodyHtml(resend[0]?.body);
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toMatch(FINANCIAL_PATTERN);
    expect(await getWelcomeSentAt(t, userId)).toBeTypeOf("number");
  });

  it("rejects on non-2xx and does not mark", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    server.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "fail" }, { status: 500 }),
      ),
    );

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await expect(t.action(internal.email.sendWelcomeEmail, { userId })).rejects.toThrow(
      /Resend send failed: 500/,
    );
    expect(await getWelcomeSentAt(t, userId)).toBeFalsy();
  });

  it("rejects on fetch failure and does not mark", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    server.use(http.post("https://api.resend.com/emails", () => HttpResponse.error()));

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await expect(t.action(internal.email.sendWelcomeEmail, { userId })).rejects.toThrow();
    expect(await getWelcomeSentAt(t, userId)).toBeFalsy();
  });
});

describe("sendEmail env safety and vendor errors", () => {
  it("logs and returns false without fetch when env is missing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const sent = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(sent).toBe(false);
    expect(errSpy).toHaveBeenCalledWith("Resend env not configured; skipping email send");
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
    errSpy.mockRestore();
  });

  it("rejects on non-2xx", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    server.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "fail" }, { status: 500 }),
      ),
    );

    await expect(
      sendEmail({ to: "a@b.com", subject: WELCOME_SUBJECT, html: welcomeHtml("Ada") }),
    ).rejects.toThrow(/Resend send failed: 500/);
  });

  it("forwards Idempotency-Key when idempotencyKey is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    await sendEmail({
      to: "a@b.com",
      subject: WELCOME_SUBJECT,
      html: welcomeHtml("Ada"),
      idempotencyKey: "welcome:user-123",
    });

    const resend = capturedRequests.filter((r) => r.vendor === "resend");
    expect(resend).toHaveLength(1);
    expect(resend[0]?.headers?.["idempotency-key"]).toBe("welcome:user-123");
  });
});

describe("onWelcomeRunComplete", () => {
  it("logs on terminal failure only", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.mutation(internal.email.onWelcomeRunComplete, {
      workId: "work-1",
      context: { userId },
      result: { kind: "failed", error: "Resend send failed: 503" },
    });

    expect(errSpy).toHaveBeenCalledWith(
      "Welcome email exhausted all retries",
      userId,
      "Resend send failed: 503",
    );

    errSpy.mockClear();

    await t.mutation(internal.email.onWelcomeRunComplete, {
      workId: "work-2",
      context: { userId },
      result: { kind: "success", returnValue: null },
    });

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("no activity emails", () => {
  it("does not send email when creating a Category", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const { owner, personalCircleId } = await seedOwner(t);

    await t.mutation(api.categories.createCategory, {
      circleId: personalCircleId,
      name: "Groceries",
      type: "expense",
      color: "green",
    });

    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
    expect(owner.email).toBe("ada@example.com");
  });
});

describe("invitationHtml", () => {
  it("includes circle, owner, recipient, invite link, expiry copy, and no financial content", () => {
    const html = invitationHtml({
      inviteLink: "https://app.example.com/invite/abc123",
      circleName: "Trip",
      ownerDisplayName: "Olive Owner",
      ownerImage: undefined,
      recipientEmail: "ada@example.com",
    });
    expect(html).toContain("ada@example.com");
    expect(html).toContain("Olive Owner");
    expect(html).toContain("Trip");
    expect(html).toContain("https://app.example.com/invite/abc123");
    expect(html).toContain("expires in 7 days");
    expect(html).not.toMatch(FINANCIAL_PATTERN);
  });

  it("escapes HTML-special chars in interpolated values", () => {
    const html = invitationHtml({
      inviteLink: "https://app.example.com/invite/tok",
      circleName: "<script>",
      ownerDisplayName: 'O"wn',
      ownerImage: undefined,
      recipientEmail: "a&b@example.com",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("a&amp;b@example.com");
    expect(html).toContain("O&quot;wn");
  });
});

describe("invitationPayload", () => {
  it("returns payload for a pending invitation", async () => {
    const t = convexTest(schema, modules);
    const { owner, invitationId } = await seedPendingInvitation(t, { circleName: "Trip" });

    const payload = await t.query(internal.email.invitationPayload, { invitationId });
    expect(payload).toEqual({
      recipientEmail: "invitee@example.com",
      circleName: "Trip",
      ownerDisplayName: owner.displayName,
      ownerImage: owner.image,
    });
  });

  it.each([
    "accepted",
    "revoked",
    "expired",
  ] as const)("returns null when status is %s", async (status) => {
    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(invitationId, { status });
    });

    const payload = await t.query(internal.email.invitationPayload, { invitationId });
    expect(payload).toBeNull();
  });

  it("returns null when the invitation row does not exist", async () => {
    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(invitationId);
    });

    const payload = await t.query(internal.email.invitationPayload, { invitationId });
    expect(payload).toBeNull();
  });

  it("returns null when the circle row is missing", async () => {
    const t = convexTest(schema, modules);
    const { circleId, invitationId } = await seedPendingInvitation(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(circleId);
    });

    const payload = await t.query(internal.email.invitationPayload, { invitationId });
    expect(payload).toBeNull();
  });

  it("returns null when the owner row is missing", async () => {
    const t = convexTest(schema, modules);
    const { owner, invitationId } = await seedPendingInvitation(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(owner._id);
    });

    const payload = await t.query(internal.email.invitationPayload, { invitationId });
    expect(payload).toBeNull();
  });
});

describe("sendInvitationEmail", () => {
  it("posts the expected payload to Resend with per-send idempotency key", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");
    vi.stubEnv("SITE_URL", "https://app.example.com");

    const t = convexTest(schema, modules);
    const { owner, invitationId } = await seedPendingInvitation(t, {
      circleName: "Trip",
      email: "ada@example.com",
    });
    const token = "plaintext-invite-token";

    await t.action(internal.email.sendInvitationEmail, { invitationId, token, resendCount: 0 });

    const resend = capturedRequests.filter((r) => r.vendor === "resend");
    expect(resend).toHaveLength(1);
    expect(resend[0]?.body).toMatchObject({
      from: "no-reply@spendcircle.test",
      to: "ada@example.com",
      subject: INVITATION_SUBJECT,
    });
    expect(resend[0]?.headers?.["idempotency-key"]).toBe(`invite:${invitationId}:0`);
    const html = resendBodyHtml(resend[0]?.body);
    expect(html).toContain(`https://app.example.com/invite/${token}`);
    expect(html).toContain(owner.displayName);
    expect(html).toContain("Trip");
    expect(html).not.toMatch(FINANCIAL_PATTERN);
  });

  it("does not send when invitationPayload returns null", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(invitationId, { status: "revoked" });
    });

    await t.action(internal.email.sendInvitationEmail, {
      invitationId,
      token: "tok",
      resendCount: 0,
    });

    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
  });

  it("does not send when Resend env is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await t.action(internal.email.sendInvitationEmail, {
      invitationId,
      token: "tok",
      resendCount: 0,
    });

    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
  });

  it("rejects on Resend 5xx without changing invitation status", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    server.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "fail" }, { status: 500 }),
      ),
    );

    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await expect(
      t.action(internal.email.sendInvitationEmail, {
        invitationId,
        token: "tok",
        resendCount: 0,
      }),
    ).rejects.toThrow(/Resend send failed: 500/);

    await t.run(async (ctx) => {
      const invite = await ctx.db.get(invitationId);
      expect(invite?.status).toBe("pending");
    });
  });

  it("uses distinct idempotency keys for two invitations to the same email", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const seed1 = await seedPendingInvitation(t, {
      email: "ada@example.com",
      circleName: "Trip A",
    });
    const seed2 = await t.run(async (ctx) => {
      const now = Date.now();
      const owner = await makeUser(ctx, "owner2@example.com", "Owner Two");
      const circleId = await ctx.db.insert("circles", {
        name: "Trip B",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "B",
        ownerUserId: owner._id,
        status: "active",
        setupCompletedAt: now,
        currencyLocked: false,
        createdAt: now,
      });
      await ctx.db.insert("members", {
        circleId,
        userId: owner._id,
        role: "owner",
        status: "active",
        displayName: owner.displayName,
        joinedAt: now,
      });
      const invitationId = await ctx.db.insert("invitations", {
        circleId,
        emailLower: "ada@example.com",
        tokenHash: "hash-b",
        status: "pending",
        invitedByUserId: owner._id,
        resendCount: 0,
        resendTimestamps: [],
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
      });
      return { invitationId };
    });

    await t.action(internal.email.sendInvitationEmail, {
      invitationId: seed1.invitationId,
      token: "token-a",
      resendCount: 0,
    });
    await t.action(internal.email.sendInvitationEmail, {
      invitationId: seed2.invitationId,
      token: "token-b",
      resendCount: 0,
    });

    const resend = capturedRequests.filter((r) => r.vendor === "resend");
    expect(resend).toHaveLength(2);
    expect(resend[0]?.headers?.["idempotency-key"]).toBe(`invite:${seed1.invitationId}:0`);
    expect(resend[1]?.headers?.["idempotency-key"]).toBe(`invite:${seed2.invitationId}:0`);
  });

  it("uses resendCount in idempotency key for resend sends", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t, {
      email: "ada@example.com",
      circleName: "Trip",
    });

    await t.action(internal.email.sendInvitationEmail, {
      invitationId,
      token: "token-r2",
      resendCount: 2,
    });

    const resend = capturedRequests.filter((r) => r.vendor === "resend");
    expect(resend).toHaveLength(1);
    expect(resend[0]?.headers?.["idempotency-key"]).toBe(`invite:${invitationId}:2`);
  });
});

describe("onInvitationRunComplete", () => {
  it("logs on terminal failure only", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const t = convexTest(schema, modules);
    const { invitationId } = await seedPendingInvitation(t);

    await t.mutation(internal.email.onInvitationRunComplete, {
      workId: "work-1",
      context: { invitationId },
      result: { kind: "failed", error: "Resend send failed: 503" },
    });

    expect(errSpy).toHaveBeenCalledWith(
      "Invitation email exhausted all retries",
      invitationId,
      "Resend send failed: 503",
    );

    errSpy.mockClear();

    await t.mutation(internal.email.onInvitationRunComplete, {
      workId: "work-2",
      context: { invitationId },
      result: { kind: "success", returnValue: null },
    });

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
