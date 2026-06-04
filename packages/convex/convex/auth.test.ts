import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "./auth.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAuth", () => {
  it("starts without Google credentials so first local backend bootstrap can set them later", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const auth = createAuth(ctx);
      await expect(auth.$context).resolves.toBeDefined();
    });
  });
});
