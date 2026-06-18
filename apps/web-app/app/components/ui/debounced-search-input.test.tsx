import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DebouncedSearchInput } from "./debounced-search-input.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("DebouncedSearchInput", () => {
  it("cancels the pending debounce when Enter flushes the query", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(
      <DebouncedSearchInput
        value=""
        onSearch={onSearch}
        label="Search title or note"
        normalize={(raw) => raw.trim()}
      />,
    );

    const searchbox = screen.getByRole("searchbox", { name: "Search title or note" });
    fireEvent.change(searchbox, { target: { value: " rent " } });
    fireEvent.keyDown(searchbox, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledExactlyOnceWith("rent");
    expect(vi.getTimerCount()).toBe(0);

    vi.runOnlyPendingTimers();
    expect(onSearch).toHaveBeenCalledExactlyOnceWith("rent");
  });
});
