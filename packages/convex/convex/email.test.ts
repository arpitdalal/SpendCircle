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

describe("claimWelcome", () => {
  it("claims once and returns user payload; second call is a no-op", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    const first = await t.mutation(internal.email.claimWelcome, { userId });
    expect(first).toEqual({ email: "ada@example.com", displayName: "Ada Lovelace" });

    const sentAt = await getWelcomeSentAt(t, userId);
    expect(sentAt).toBeTypeOf("number");

    const second = await t.mutation(internal.email.claimWelcome, { userId });
    expect(second).toBeNull();
    expect(await getWelcomeSentAt(t, userId)).toBe(sentAt);
  });
});

describe("sendWelcomeEmail idempotency", () => {
  it("sets welcomeSentAt once even when Resend env is unset (no network)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const t = convexTest(schema, modules);
    const { userId } = await seedOwner(t);

    await t.action(internal.email.sendWelcomeEmail, { userId });
    const sentAt = await getWelcomeSentAt(t, userId);
    expect(sentAt).toBeTypeOf("number");
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);

    await t.action(internal.email.sendWelcomeEmail, { userId });
    expect(await getWelcomeSentAt(t, userId)).toBe(sentAt);
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
  });
});

describe("sendWelcomeEmail Resend payload (MSW)", () => {
  it("posts the expected payload to Resend when env is configured", async () => {
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
    const html = (resend[0]?.body as { html?: string })?.html ?? "";
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toMatch(FINANCIAL_PATTERN);
  });
});

describe("sendEmail env safety and vendor errors", () => {
  it("logs and returns without fetch when env is missing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" });

    expect(errSpy).toHaveBeenCalledWith("Resend env not configured; skipping email send");
    expect(capturedRequests.filter((r) => r.vendor === "resend")).toHaveLength(0);
    errSpy.mockRestore();
  });

  it("logs vendor errors without throwing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@spendcircle.test");

    server.use(
      http.post("https://api.resend.com/emails", () =>
        HttpResponse.json({ message: "fail" }, { status: 500 }),
      ),
    );

    await expect(
      sendEmail({ to: "a@b.com", subject: WELCOME_SUBJECT, html: welcomeHtml("Ada") }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    expect(String(errSpy.mock.calls[0]?.[0])).toContain("Resend send failed");
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
