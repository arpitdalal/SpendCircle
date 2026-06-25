import { afterEach, describe, expect, it, vi } from "vitest";
import { handleUnavailableRefLink, handleUnparseableRefLink } from "./ref-link-failure.js";
import { reportAppError } from "./report-error.js";

vi.mock("./report-error.js", () => ({ reportAppError: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ref-link-failure", () => {
  it("reports an unparseable ref and marks consumed without a snackbar by default", () => {
    const showUnavailable = vi.fn();
    const onConsumed = vi.fn();

    handleUnparseableRefLink({
      rawRef: "bad-ref",
      reportMessage: "Unparseable categoryRef in URL",
      showUnavailable,
      onConsumed,
    });

    expect(reportAppError).toHaveBeenCalledWith("Unparseable categoryRef in URL", {
      rawRef: "bad-ref",
    });
    expect(showUnavailable).not.toHaveBeenCalled();
    expect(onConsumed).toHaveBeenCalledOnce();
  });

  it("reports and shows unavailable when alsoShowUnavailable is set", () => {
    const showUnavailable = vi.fn();
    const onConsumed = vi.fn();

    handleUnparseableRefLink({
      rawRef: "bad-ref",
      reportMessage: "Unparseable ref in URL",
      showUnavailable,
      unavailableTarget: "circle",
      alsoShowUnavailable: true,
      onConsumed,
    });

    expect(reportAppError).toHaveBeenCalledOnce();
    expect(showUnavailable).toHaveBeenCalledWith("circle");
    expect(onConsumed).toHaveBeenCalledOnce();
  });

  it("fires the unavailable snackbar for a missing target", () => {
    const showUnavailable = vi.fn();
    const onConsumed = vi.fn();

    handleUnavailableRefLink({
      showUnavailable,
      onConsumed,
    });

    expect(showUnavailable).toHaveBeenCalledWith("link");
    expect(onConsumed).toHaveBeenCalledOnce();
  });
});
