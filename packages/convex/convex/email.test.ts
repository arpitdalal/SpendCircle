import { capturedRequests, HttpResponse, http, resetCapturedRequests } from "@spend-circle/mocks";
import { server } from "@spend-circle/mocks/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { sendEmail, WELCOME_SUBJECT, welcomeHtml } from "./email.js";
import schema from "./schema.js";
import { seedPersonalCircleOwner } from "./test/seed.js";

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
