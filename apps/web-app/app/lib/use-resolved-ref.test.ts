import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportAppError } from "./report-error.js";
import { type ResolvedRefOptions, useResolvedRef } from "./use-resolved-ref.js";

// The primitive owns navigation, the snackbar, and error reporting through three
// seams; we stub all three so the state machine is asserted in isolation, exactly
// as ADR 0017 intends ("test the primitive directly").
const { navigate, showUnavailableLink } = vi.hoisted(() => ({
  navigate: vi.fn(),
  showUnavailableLink: vi.fn(),
}));
vi.mock("react-router", () => ({ useNavigate: () => navigate }));
vi.mock("./snackbar.js", () => ({
  useSnackbar: () => ({ show: vi.fn(), showUnavailableLink }),
}));
vi.mock("./report-error.js", () => ({ reportAppError: vi.fn() }));

interface TestRef {
  ref: string;
  name: string;
}

const canonicalPath = (value: TestRef) => `/c/${value.ref}`;

function resolve(overrides: Partial<ResolvedRefOptions<TestRef>>) {
  const options: ResolvedRefOptions<TestRef> = {
    rawRef: "home-c1",
    parsed: true,
    value: undefined,
    canonicalPath,
    fallback: "/",
    ...overrides,
  };
  return renderHook(() => useResolvedRef(options)).result.current;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useResolvedRef", () => {
  it("is pending while the value is loading, with no side effects", () => {
    const result = resolve({ value: undefined });
    expect(result).toEqual({ status: "pending" });
    expect(navigate).not.toHaveBeenCalled();
    expect(showUnavailableLink).not.toHaveBeenCalled();
    expect(reportAppError).not.toHaveBeenCalled();
  });

  it("is ready when the value resolves on its canonical ref, with no navigation", () => {
    const value: TestRef = { ref: "home-c1", name: "Home" };
    const result = resolve({ value });
    expect(result).toEqual({ status: "ready", value });
    expect(navigate).not.toHaveBeenCalled();
    expect(reportAppError).not.toHaveBeenCalled();
  });

  it("falls back and reports when the ref is unparseable (an app-emitted bad link)", () => {
    resolve({ parsed: false, value: undefined, fallback: "/safe" });
    expect(showUnavailableLink).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/safe", { replace: true });
    expect(reportAppError).toHaveBeenCalledOnce();
  });

  it("falls back silently when the target is inaccessible (no report — permission outcome)", () => {
    resolve({ parsed: true, value: null, fallback: "/safe" });
    expect(showUnavailableLink).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/safe", { replace: true });
    expect(reportAppError).not.toHaveBeenCalled();
  });

  it("canonicalizes a stale ref via replace navigation without a snackbar", () => {
    const value: TestRef = { ref: "home-c1", name: "Home" };
    resolve({ rawRef: "c1", value }); // bare id ⇒ stale vs canonical "home-c1"
    expect(navigate).toHaveBeenCalledWith("/c/home-c1", { replace: true });
    expect(showUnavailableLink).not.toHaveBeenCalled();
    expect(reportAppError).not.toHaveBeenCalled();
  });
});
