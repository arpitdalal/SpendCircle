// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("authenticated web app", () => {
  it("shows legal links before dev sign-in and lands in a renameable Personal Circle", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(screen.getByRole("heading", { name: "Ada's Personal Circle" })).toBeInTheDocument();
    expect(screen.getByText("App Version 0.1.0")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Circle name"));
    await user.type(screen.getByLabelText("Circle name"), "Solo Ledger");
    await user.click(screen.getByRole("button", { name: "Rename Circle" }));

    expect(screen.getByRole("heading", { name: "Solo Ledger" })).toBeInTheDocument();
  });
});
