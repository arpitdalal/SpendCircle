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
  identity = label,
}: {
  onConfirm: () => void;
  timeoutMs?: number;
  label?: string;
  identity?: string;
}) {
  const { armed, getButtonProps } = useDoubleCheck({ onConfirm, timeoutMs, identity });
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

  it("disarms when identity changes (list recycled this instance for a new row)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <DoubleCheckButton onConfirm={onConfirm} label="Groceries" identity="txn-a" />,
    );
    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    expect(screen.getByRole("button")).toHaveTextContent("Confirm archive");

    rerender(<DoubleCheckButton onConfirm={onConfirm} label="Groceries" identity="txn-b" />);

    expect(screen.getByRole("button")).toHaveTextContent("Archive");
    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays armed across re-renders that keep the same identity", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <DoubleCheckButton onConfirm={onConfirm} label="Groceries" identity="txn-a" />,
    );
    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));
    rerender(<DoubleCheckButton onConfirm={onConfirm} label="Bills" identity="txn-a" />);
    expect(screen.getByRole("button")).toHaveTextContent("Confirm archive");
  });

  it("a confirm after an identity change targets the new entity, not the stale one", async () => {
    const user = userEvent.setup();
    const onConfirmA = vi.fn();
    const onConfirmB = vi.fn();
    const { rerender } = render(
      <DoubleCheckButton onConfirm={onConfirmA} identity="a" label="A" />,
    );
    await user.click(screen.getByRole("button", { name: "Archive A" }));
    rerender(<DoubleCheckButton onConfirm={onConfirmB} identity="b" label="B" />);
    await user.click(screen.getByRole("button", { name: "Archive B" }));
    await user.click(screen.getByRole("button", { name: "Confirm archive B" }));
    expect(onConfirmA).not.toHaveBeenCalled();
    expect(onConfirmB).toHaveBeenCalledTimes(1);
  });

  it("does not restore armed state when identity returns to a previously armed entity", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <DoubleCheckButton onConfirm={onConfirm} label="A" identity="txn-a" />,
    );
    await user.click(screen.getByRole("button", { name: "Archive A" }));
    expect(screen.getByRole("button")).toHaveTextContent("Confirm archive");

    rerender(<DoubleCheckButton onConfirm={onConfirm} label="B" identity="txn-b" />);
    rerender(<DoubleCheckButton onConfirm={onConfirm} label="A" identity="txn-a" />);

    expect(screen.getByRole("button")).toHaveTextContent("Archive");
    await user.click(screen.getByRole("button", { name: "Archive A" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
