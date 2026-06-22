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
  it("forwards to Sentry.captureMessage with extra context", () => {
    reportAppError("Unparseable ref in URL", { rawRef: "not-a-ref" });

    expect(captureMessage).toHaveBeenCalledWith("Unparseable ref in URL", {
      extra: { rawRef: "not-a-ref" },
    });
  });

  it("does not attach financial fields when only safe context is provided", () => {
    reportAppError("Unparseable ref in URL", { rawRef: "bad-slug" });

    const [, options] = captureMessage.mock.calls[0] ?? [];
    expect(options).toEqual({ extra: { rawRef: "bad-slug" } });
    expect(options?.extra).not.toHaveProperty("amount");
    expect(options?.extra).not.toHaveProperty("title");
    expect(options?.extra).not.toHaveProperty("note");
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
