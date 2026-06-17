import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { firstPage, seedCircle } from "./test/seed.js";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("backfillCircleSetupCompleted", () => {
  it("grandfathers every Circle missing setupCompletedAt", async () => {
    vi.stubEnv("CIRCLE_SETUP_BACKFILL_KEY", "test-key");
    const t = convexTest(schema, modules);
    const { circleId: incompleteId } = await t.run((ctx) => seedCircle(ctx));
    const completeId = await t.run(async (ctx) => {
      const now = Date.now();
      const { circleId } = await seedCircle(ctx);
      await ctx.db.patch(circleId, { setupCompletedAt: now });
      return circleId;
    });

    const page = await t.mutation(api.maintenance.backfillCircleSetupCompleted, {
      operatorKey: "test-key",
      paginationOpts: firstPage(10).paginationOpts,
    });

    expect(page.patched).toBe(1);
    expect(page.isDone).toBe(true);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(incompleteId))?.setupCompletedAt).toBeTypeOf("number");
      expect((await ctx.db.get(completeId))?.setupCompletedAt).toBeTypeOf("number");
    });
  });

  it("rejects an invalid operator key", async () => {
    vi.stubEnv("CIRCLE_SETUP_BACKFILL_KEY", "test-key");
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.maintenance.backfillCircleSetupCompleted, {
        operatorKey: "wrong",
        paginationOpts: firstPage(10).paginationOpts,
      }),
    ).rejects.toThrow(/Invalid circle setup backfill key/);
  });
});
