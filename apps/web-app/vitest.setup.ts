import "@testing-library/jest-dom/vitest";
import { server } from "@spend-circle/mocks/server";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

// jsdom ships no ResizeObserver; Recharts' ResponsiveContainer (the Dashboard
// chart — RPT-4) requires one to mount. A no-op satisfies it: jsdom boxes have no
// real layout, so there is never a resize to observe, and the chart's DATA is
// asserted through its accessible table rather than rendered SVG geometry.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// The MSW node server is enabled unconditionally for the whole unit/integration
// suite so tests never reach real vendors (ADR 0006).
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
