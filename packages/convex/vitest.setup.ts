import { resetCapturedRequests } from "@spend-circle/mocks";
import { server } from "@spend-circle/mocks/server";
import { afterAll, afterEach, beforeAll } from "vitest";

// MSW intercepts outbound vendor fetch calls during convex-test actions (ADR 0006).
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  resetCapturedRequests();
});
afterAll(() => server.close());
