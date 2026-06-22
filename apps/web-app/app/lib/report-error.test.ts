import { afterEach, describe, expect, it, vi } from "vitest";

const captureMessage = vi.hoisted(() => vi.fn());

vi.mock("@sentry/react", () => ({
  captureMessage,
}));

import { reportAppError } from "./report-error.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("reportAppError", () => {
  it("forwards scrubbed context to Sentry.captureMessage", () => {
    reportAppError("Unparseable ref in URL", { rawRef: "grocery-shopping-bad!" });

    expect(captureMessage).toHaveBeenCalledWith("Unparseable ref in URL", {
      extra: { rawRef: "[unparseable-ref]" },
    });
  });

  it("redacts title-bearing refs and drops financial fields before capture", () => {
    reportAppError("Unparseable ref in URL", {
      rawRef: "weekly-shop-t1abc",
      title: "Weekly shop",
      amountMinorUnits: 500,
    });

    const [, options] = captureMessage.mock.calls[0] ?? [];
    expect(options).toEqual({ extra: { rawRef: "t1abc" } });
  });

  it("console.warns in dev so local signal is unchanged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportAppError("test error", { rawRef: "x" });

    if (import.meta.env.DEV) {
      expect(warn).toHaveBeenCalledWith("[app] test error", { rawRef: "x" });
    } else {
      expect(warn).not.toHaveBeenCalled();
    }

    warn.mockRestore();
  });
});
