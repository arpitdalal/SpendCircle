import "@testing-library/jest-dom/vitest";
import { server } from "@spend-circle/mocks/server";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

// The MSW node server is enabled unconditionally for the whole unit/integration
// suite so tests never reach real vendors (ADR 0006).
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
