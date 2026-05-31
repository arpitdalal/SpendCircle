import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as a child element when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/somewhere">Link button</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Link button" })).toBeInTheDocument();
  });
});
