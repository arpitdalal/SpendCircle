import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, Circle } from "~/lib/data.js";
import { configureConvex, renderInCircle, testId } from "~/test/convex-react.js";

/**
 * Behavior test for the Categories surface (jsdom). The ONLY thing doubled is
 * Convex's reactive client (`convex/react`, via the shared helper). The real
 * `~/lib/data.js` hooks, the real `useCircle` Outlet-context seam, and the real
 * route + form logic run, so a drift between the route, the data layer, and the
 * backend query contract is caught here rather than mocked away (ADR 0006).
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleCategories from "./categories.js";

const createCategory = vi.fn();

function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: testId<Category["id"]>("cat-1"),
    name: "Groceries",
    type: "expense",
    color: "green",
    status: "active",
    creator: { displayName: "You", image: undefined },
    ...over,
  };
}

function setup(opts: { circle?: Partial<Circle>; categories?: Category[] | null } = {}) {
  const circle: Circle = {
    id: testId<Circle["id"]>("c1"),
    ref: "trip-c1",
    name: "Trip",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    status: "active",
    setupAnswers: undefined,
    currencyLocked: false,
    ...opts.circle,
  };
  createCategory.mockReset();
  createCategory.mockResolvedValue("new-id");
  configureConvex({ categories: opts.categories, createCategory });
  return renderInCircle(circle, <CircleCategories />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleCategories", () => {
  it("lists active categories of the selected type", () => {
    setup({
      categories: [
        makeCategory(),
        makeCategory({ id: testId<Category["id"]>("c2"), name: "Rent" }),
      ],
    });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Groceries")).toBeInTheDocument();
    expect(within(list).getByText("Rent")).toBeInTheDocument();
  });

  it("excludes archived categories from the list (does not request includeArchived)", () => {
    setup({
      categories: [
        makeCategory({ name: "Groceries" }),
        makeCategory({
          id: testId<Category["id"]>("cat-archived"),
          name: "Old Subscriptions",
          status: "archived",
        }),
      ],
    });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Groceries")).toBeInTheDocument();
    // This asserts the query contract *indirectly* and rests on one invariant: the
    // real-mode data hook returns the query verbatim (data.ts `return queried`) — no
    // client-side status filter. Given that, an archived row appearing can only mean
    // the route wrongly asked for `includeArchived: true`. If you ever add a real-mode
    // client filter there (mirroring the MOCKS branch), this test would pass even with
    // a widened query — add a direct query-args assertion before doing so.
    expect(within(list).queryByText("Old Subscriptions")).not.toBeInTheDocument();
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
        makeCategory({ id: testId<Category["id"]>("i1"), name: "Salary", type: "income" }),
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
    const input = screen.getByLabelText<HTMLInputElement>(/New expense category/);

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
