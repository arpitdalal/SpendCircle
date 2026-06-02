import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SnackbarProvider, useSnackbar } from "./snackbar.js";

// A tiny harness that surfaces the snackbar API as buttons, so the closed
// vocabulary is exercised through the real provider/context rather than a double.
function Harness() {
  const { show, showUnavailable } = useSnackbar();
  return (
    <>
      <button type="button" onClick={() => show("Custom copy")}>
        show
      </button>
      <button type="button" onClick={() => showUnavailable()}>
        default
      </button>
      <button type="button" onClick={() => showUnavailable("circle")}>
        circle
      </button>
    </>
  );
}

function renderHarness() {
  return render(
    <SnackbarProvider>
      <Harness />
    </SnackbarProvider>,
  );
}

describe("snackbar unavailable vocabulary (ADR 0016)", () => {
  it("defaults to the generic bad-link copy", () => {
    renderHarness();
    act(() => screen.getByText("default").click());
    // The exact anti-enumeration string is locked here — it must stay generic and
    // identical for missing vs inaccessible targets so existence never leaks.
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
  });

  it("maps the 'circle' token to the Circle-flavored copy", () => {
    renderHarness();
    act(() => screen.getByText("circle").click());
    expect(screen.getByText("This circle isn't available.")).toBeInTheDocument();
  });

  it("passes arbitrary copy through `show` (the unconstrained, non-enumeration path)", () => {
    renderHarness();
    act(() => screen.getByText("show").click());
    expect(screen.getByText("Custom copy")).toBeInTheDocument();
  });
});
