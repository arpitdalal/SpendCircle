import { renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useValueChange } from "./use-value-change.js";

describe("useValueChange", () => {
  it("does not fire on the initial commit", () => {
    const onChange = vi.fn();
    renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires once with (current, previous) when the value changes", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b", "a");
  });

  it("does not fire on a rerender with the same value", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    rerender({ value: "a" });
    rerender({ value: "a" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses Object.is identity (NaN is stable, the value is not retriggered)", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: Number.NaN },
    });

    rerender({ value: Number.NaN });
    expect(onChange).not.toHaveBeenCalled();

    rerender({ value: 0 });
    expect(onChange).toHaveBeenLastCalledWith(0, Number.NaN);
  });

  it("re-arms across successive changes", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });
    rerender({ value: "c" });

    expect(onChange.mock.calls).toEqual([
      ["b", "a"],
      ["c", "b"],
    ]);
  });

  it("resets sibling state during render when the value changes (the More-sheet shape)", () => {
    const committed: boolean[] = [];
    const { rerender } = renderHook(
      ({ route }) => {
        const [open, setOpen] = useState(true);
        committed.push(open);
        useValueChange(route, () => setOpen(false));
        return open;
      },
      { initialProps: { route: "/a" } },
    );

    // Same route: no reset, the flag stays as the component left it.
    rerender({ route: "/a" });
    expect(committed.at(-1)).toBe(true);

    // Changed route: onChange flips the flag during the same render, before paint.
    rerender({ route: "/b" });
    expect(committed.at(-1)).toBe(false);
  });
});
