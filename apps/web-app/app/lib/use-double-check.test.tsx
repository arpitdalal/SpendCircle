import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDoubleCheck } from "./use-double-check.js";

afterEach(() => {
  vi.useRealTimers();
});

function DoubleCheckButton({
  onConfirm,
  timeoutMs,
  label = "Item",
}: {
  onConfirm: () => void;
  timeoutMs?: number;
  label?: string;
}) {
  const { armed, getButtonProps } = useDoubleCheck({ onConfirm, timeoutMs });
  return (
    <button
      type="button"
      data-armed={armed}
      aria-label={armed ? `Confirm archive ${label}` : `Archive ${label}`}
      {...getButtonProps()}
    >
      {armed ? "Confirm archive" : "Archive"}
    </button>
  );
}

describe("useDoubleCheck", () => {
  it("first activation arms without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DoubleCheckButton onConfirm={onConfirm} label="Groceries" />);

    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm archive Groceries" })).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Confirm archive");
  });

  it("second activation within the timeout calls onConfirm once", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DoubleCheckButton onConfirm={onConfirm} label="Groceries" />);

    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    await user.click(screen.getByRole("button", { name: "Confirm archive Groceries" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
  });

  it("auto-resets after the timeout", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    render(<DoubleCheckButton onConfirm={onConfirm} timeoutMs={10_000} label="Groceries" />);

    fireEvent.click(screen.getByRole("button", { name: "Archive Groceries" }));
    act(() => {
      vi.advanceTimersByTime(10_001);
    });

    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archive Groceries" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("resets on blur", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <>
        <DoubleCheckButton onConfirm={onConfirm} label="Groceries" />
        <button type="button">Elsewhere</button>
      </>,
    );

    const archive = screen.getByRole("button", { name: "Archive Groceries" });
    await user.click(archive);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("resets on Escape", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DoubleCheckButton onConfirm={onConfirm} label="Groceries" />);

    const archive = screen.getByRole("button", { name: "Archive Groceries" });
    await user.click(archive);
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
