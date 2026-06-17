import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel.js";
import { createUserWithPersonalCircle, propagateUserProfile } from "./model.js";
import schema from "./schema.js";

// Tests the bootstrap invariant directly through the db helper, independent of
// the Better Auth component wiring (which `onCreateUser` calls in production).
// convex-test reads these glob keys to locate the `_generated` modules root;
// auth.ts/http.ts are not imported because the test never calls api functions.
const modules = import.meta.glob("./**/*.ts");

describe("createUserWithPersonalCircle", () => {
  it("creates the User and an always-solo Personal Circle owned by them", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.email).toBe("ada@example.com");

      const circles = await ctx.db.query("circles").collect();
      expect(circles).toHaveLength(1);
      expect(circles[0]?.kind).toBe("personal");
      expect(circles[0]?.ownerUserId).toBe(userId);
      expect(circles[0]?.setupCompletedAt).toBeTypeOf("number");

      const members = await ctx.db.query("members").collect();
      expect(members).toHaveLength(1);
      expect(members[0]?.role).toBe("owner");
      expect(members[0]?.userId).toBe(userId);
    });
  });

  it("defaults to USD for an unsupported currency", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "grace@example.com",
        displayName: "Grace Hopper",
        currency: "XYZ",
      }),
    );
    await t.run(async (ctx) => {
      const circle = await ctx.db.query("circles").first();
      expect(circle?.currency).toBe("USD");
    });
  });
});

describe("propagateUserProfile", () => {
  it("mirrors a new profile onto the User and active members, leaving removed members frozen", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
      }),
    );

    // A second Circle where the User is an ACTIVE member, and a third where the
    // User has been REMOVED — its identity must freeze at the old name.
    const removedMemberId = await t.run(async (ctx) => {
      const now = Date.now();
      const activeCircle = await ctx.db.insert("circles", {
        name: "Team",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "T",
        ownerUserId: userId,
        status: "active",
        currencyLocked: false,
        createdAt: now,
      });
      await ctx.db.insert("members", {
        circleId: activeCircle,
        userId,
        role: "member",
        status: "active",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
        joinedAt: now,
      });
      const removedCircle = await ctx.db.insert("circles", {
        name: "Old Club",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "O",
        ownerUserId: userId,
        status: "active",
        currencyLocked: false,
        createdAt: now,
      });
      return await ctx.db.insert("members", {
        circleId: removedCircle,
        userId,
        role: "member",
        status: "removed",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
        joinedAt: now,
        removedAt: now,
      });
    });

    await t.run((ctx) =>
      propagateUserProfile(ctx, userId, {
        displayName: "Ada King",
        image: "https://img/new.png",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.displayName).toBe("Ada King");
      expect(user?.image).toBe("https://img/new.png");

      const members = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const active = members.filter((m) => m.status === "active");
      expect(active).toHaveLength(2);
      for (const member of active) {
        expect(member.displayName).toBe("Ada King");
        expect(member.image).toBe("https://img/new.png");
      }

      const removed = await ctx.db.get(removedMemberId);
      expect(removed?.displayName).toBe("Ada Lovelace"); // frozen
      expect(removed?.image).toBe("https://img/old.png");
    });
  });

  it("clears the image when the new profile has none", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "grace@example.com",
        displayName: "Grace Hopper",
        image: "https://img/grace.png",
      }),
    );

    await t.run((ctx) => propagateUserProfile(ctx, userId, { displayName: "Grace Hopper" }));

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.image).toBeUndefined();
      const member = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      expect(member?.image).toBeUndefined();
    });
  });

  it("no-ops for a User that has not been bootstrapped", async () => {
    const t = convexTest(schema, modules);
    const missing = "k0000000000000000000000000000000" as Id<"users">;
    const completed = await t.run(async (ctx) => {
      await propagateUserProfile(ctx, missing, { displayName: "Nobody" });
      return "ok";
    });
    expect(completed).toBe("ok");
  });
});
