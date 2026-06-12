import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";
import { buttonVariants } from "./button-variants.js";

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

  it("documents link-as-button styling: use `buttonVariants` on `Link`, not `Button#render`", () => {
    render(
      <MemoryRouter>
        <Link to="/somewhere" className={buttonVariants({ variant: "default" })}>
          Link styled as button
        </Link>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Link styled as button" })).toBeInTheDocument();
  });
});
