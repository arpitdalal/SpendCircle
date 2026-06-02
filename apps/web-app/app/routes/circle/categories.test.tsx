import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, Circle } from "~/lib/data.js";

/**
 * Render smoke for the Categories surface (jsdom, no backend). The data seam
 * (`useCategories`/`useCreateCategory`) and the resolved Circle are mocked, so
 * the route's behavior — type switching, the create call, and the inline
 * unique-name error — is asserted without a live Convex client (ADR 0006).
 */
const { useCategories, useCreateCategory, createCategory, useCircle } = vi.hoisted(() => ({
  useCategories: vi.fn(),
  useCreateCategory: vi.fn(),
  createCategory: vi.fn(),
  useCircle: vi.fn(),
}));
vi.mock("~/lib/data.js", () => ({ useCategories, useCreateCategory }));
vi.mock("~/routes/layouts/circle-layout.js", () => ({ useCircle }));

import CircleCategories from "./categories.js";

function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: "cat-1" as Category["id"],
    name: "Groceries",
    type: "expense",
    color: "green",
    status: "active",
    creator: { displayName: "You", image: undefined },
    ...over,
  };
}

function setup(
  opts: { circle?: Partial<Circle>; categories?: Category[] | null | undefined } = {},
) {
  const circle: Circle = {
    id: "c1" as Circle["id"],
    ref: "trip-c1",
    name: "Trip",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    status: "active",
    currencyLocked: false,
    ...opts.circle,
  };
  useCircle.mockReturnValue(circle);
  createCategory.mockReset();
  createCategory.mockResolvedValue("new-id");
  useCreateCategory.mockReturnValue(createCategory);
  // Filter fixtures by the requested type, mirroring the real hook.
  useCategories.mockImplementation((_id: Circle["id"], type: Category["type"]) =>
    opts.categories === undefined
      ? undefined
      : (opts.categories ?? []).filter((c) => c.type === type),
  );
  return render(
    <MemoryRouter>
      <CircleCategories />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleCategories", () => {
  it("lists active categories of the selected type", () => {
    setup({
      categories: [makeCategory(), makeCategory({ id: "c2" as Category["id"], name: "Rent" })],
    });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Groceries")).toBeInTheDocument();
    expect(within(list).getByText("Rent")).toBeInTheDocument();
  });

  it("shows an empty state when there are no categories of the type", () => {
    setup({ categories: [] });
    expect(screen.getByText(/No expense categories yet/)).toBeInTheDocument();
  });

  it("switches the list and form to Income when the Income tab is selected", async () => {
    const user = userEvent.setup();
    setup({
      categories: [
        makeCategory({ name: "Groceries", type: "expense" }),
        makeCategory({ id: "i1" as Category["id"], name: "Salary", type: "income" }),
      ],
    });
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.queryByText("Salary")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Income" }));

    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
    expect(screen.getByText(/New income category/)).toBeInTheDocument();
  });

  it("submits a new category with the entered name, selected type, and color", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });

    await user.type(screen.getByLabelText(/New expense category/), "Dining");
    await user.click(screen.getByRole("button", { name: "Teal" }));
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(createCategory).toHaveBeenCalledWith({
      circleId: "c1",
      name: "Dining",
      type: "expense",
      color: "teal",
    });
  });

  it("clears the name input after a successful create", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });
    const input = screen.getByLabelText(/New expense category/) as HTMLInputElement;

    await user.type(input, "Dining");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(input.value).toBe("");
  });

  it("surfaces the unique-name rejection inline", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });
    createCategory.mockRejectedValueOnce(
      new Error("A category with this name already exists for this type"),
    );

    await user.type(screen.getByLabelText(/New expense category/), "Groceries");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("shows a generic error for an unexpected failure", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });
    createCategory.mockRejectedValueOnce(new Error("Network down"));

    await user.type(screen.getByLabelText(/New expense category/), "Groceries");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't create the category/i);
    expect(alert).not.toHaveTextContent(/Network down/);
  });

  it("disables the submit button until a name is entered", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });
    const submit = screen.getByRole("button", { name: "Add category" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/New expense category/), "Dining");
    expect(submit).toBeEnabled();
  });

  it("renders a read-only notice instead of the form for an archived Circle", () => {
    setup({ circle: { status: "archived" }, categories: [] });
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add category" })).not.toBeInTheDocument();
  });

  it("shows a loading state while categories resolve", () => {
    setup({ categories: undefined });
    expect(screen.getByText(/Loading categories/)).toBeInTheDocument();
  });
});
