import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, CategoryHistoryEvent, Circle } from "~/lib/data.js";
import {
  configureConvex,
  makeCategoryView,
  makeCircleView,
  makeHistoryEventView,
  renderInCircle,
  testId,
} from "~/test/convex-react.js";

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
const updateCategory = vi.fn();
const archiveCategory = vi.fn();
const restoreCategory = vi.fn();

function setup(
  opts: {
    circle?: Partial<Circle>;
    categories?: Category[] | null;
    categoryHistory?: CategoryHistoryEvent[];
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  createCategory.mockReset().mockResolvedValue("new-id");
  updateCategory.mockReset().mockResolvedValue("cat-groceries");
  archiveCategory.mockReset().mockResolvedValue("cat-groceries");
  restoreCategory.mockReset().mockResolvedValue("cat-groceries");
  configureConvex({
    categories: opts.categories,
    categoryHistory: opts.categoryHistory,
    createCategory,
    updateCategory,
    archiveCategory,
    restoreCategory,
  });
  return renderInCircle(circle, <CircleCategories />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleCategories — list and create (CAT-1)", () => {
  it("lists active categories of the selected type", () => {
    setup({
      categories: [
        makeCategoryView(),
        makeCategoryView({ id: testId<Category["id"]>("c2"), name: "Rent" }),
      ],
    });
    const list = screen.getByRole("list");
    expect(within(list).getByText("Groceries")).toBeInTheDocument();
    expect(within(list).getByText("Rent")).toBeInTheDocument();
  });

  it("excludes archived categories from the list (does not request includeArchived)", () => {
    setup({
      categories: [
        makeCategoryView({ name: "Groceries" }),
        makeCategoryView({
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
        makeCategoryView({ name: "Groceries", type: "expense" }),
        makeCategoryView({ id: testId<Category["id"]>("i1"), name: "Salary", type: "income" }),
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

describe("CircleCategories — capability-gated affordances (CAT-2)", () => {
  it("offers Edit and Archive on a row the server says the viewer may manage", () => {
    setup({ categories: [makeCategoryView()] });
    expect(screen.getByRole("button", { name: "Edit Groceries" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
  });

  it("hides Edit when the server returned canEditFields: false (Owner moderating)", () => {
    setup({ categories: [makeCategoryView({ canEditFields: false, canArchive: true })] });
    expect(screen.queryByRole("button", { name: "Edit Groceries" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Groceries" })).toBeInTheDocument();
  });

  it("hides both lifecycle affordances for a bystander, but keeps History", () => {
    setup({ categories: [makeCategoryView({ canEditFields: false, canArchive: false })] });
    expect(screen.queryByRole("button", { name: "Edit Groceries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive Groceries" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History of Groceries" })).toBeInTheDocument();
  });

  it("hides Edit/Archive on an archived Circle (read-only) but keeps History", () => {
    setup({ circle: { status: "archived" }, categories: [makeCategoryView()] });
    expect(screen.queryByRole("button", { name: "Edit Groceries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive Groceries" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History of Groceries" })).toBeInTheDocument();
  });
});

describe("CircleCategories — edit flow (CAT-2)", () => {
  it("opens the inline form prefilled and sends only the changed fields", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    const form = screen.getByRole("form", { name: "Edit Groceries" });
    const input = within(form).getByLabelText<HTMLInputElement>("Name");
    expect(input.value).toBe("Groceries");

    await user.clear(input);
    await user.type(input, "Food");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    // Color untouched ⇒ omitted, so the server diff stays a name-only edit.
    expect(updateCategory).toHaveBeenCalledWith({
      categoryId: "cat-groceries",
      name: "Food",
    });
  });

  it("sends only the color when just the swatch changes", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    const form = screen.getByRole("form", { name: "Edit Groceries" });
    await user.click(within(form).getByRole("button", { name: "Teal" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(updateCategory).toHaveBeenCalledWith({
      categoryId: "cat-groceries",
      color: "teal",
    });
  });

  it("closes without writing when nothing changed", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    await user.click(
      within(screen.getByRole("form", { name: "Edit Groceries" })).getByRole("button", {
        name: "Save",
      }),
    );

    expect(updateCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Edit Groceries" })).not.toBeInTheDocument();
  });

  it("Cancel closes the form without writing", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Edit Groceries" })).not.toBeInTheDocument();
  });

  it("surfaces the rename-collision rejection inline and stays open", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });
    updateCategory.mockRejectedValueOnce(
      new Error("A category with this name already exists for this type"),
    );

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    const form = screen.getByRole("form", { name: "Edit Groceries" });
    const input = within(form).getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "Gas");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
    expect(screen.getByRole("form", { name: "Edit Groceries" })).toBeInTheDocument();
  });

  it("shows a generic error for an unexpected save failure", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });
    updateCategory.mockRejectedValueOnce(new Error("Circle is archived"));

    await user.click(screen.getByRole("button", { name: "Edit Groceries" }));
    const form = screen.getByRole("form", { name: "Edit Groceries" });
    const input = within(form).getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "Food");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't save the category/i);
    expect(alert).not.toHaveTextContent(/Circle is archived/);
  });
});

describe("CircleCategories — archive / restore (CAT-2)", () => {
  it("archives a row through the mutation", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });

    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));

    expect(archiveCategory).toHaveBeenCalledWith({ categoryId: "cat-groceries" });
  });

  it("shows archived rows with a badge and a Restore affordance when toggled on", async () => {
    const user = userEvent.setup();
    setup({
      categories: [
        makeCategoryView(),
        makeCategoryView({
          id: testId<Category["id"]>("cat-old"),
          name: "Old Subscriptions",
          status: "archived",
        }),
      ],
    });

    await user.click(screen.getByRole("switch", { name: "Show archived" }));

    const row = screen.getByText("Old Subscriptions").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Archived")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore Old Subscriptions" }));
    expect(restoreCategory).toHaveBeenCalledWith({ categoryId: "cat-old" });
    // An archived row is frozen: no Edit even for its creator.
    expect(
      screen.queryByRole("button", { name: "Edit Old Subscriptions" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces an inline alert when archiving fails, and never swallows it", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    archiveCategory.mockRejectedValueOnce(new Error("Circle is archived"));

    await user.click(screen.getByRole("button", { name: "Archive Groceries" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't archive the category/i);
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("CircleCategories — history panel (CAT-2)", () => {
  it("expands a row's history newest-first with actor, action, and field changes", async () => {
    const user = userEvent.setup();
    setup({
      categories: [makeCategoryView()],
      categoryHistory: [
        makeHistoryEventView({
          id: testId<CategoryHistoryEvent["id"]>("h2"),
          action: "edited",
          actor: { displayName: "Cleo Creator", image: undefined },
          changes: [
            { field: "name", from: "Food", to: "Groceries" },
            { field: "color", from: "Teal", to: "Green" },
          ],
        }),
        makeHistoryEventView({
          id: testId<CategoryHistoryEvent["id"]>("h1"),
          action: "created",
          changes: [
            { field: "name", to: "Food" },
            { field: "color", to: "Teal" },
          ],
        }),
      ],
    });

    const historyButton = screen.getByRole("button", { name: "History of Groceries" });
    expect(historyButton).toHaveAttribute("aria-expanded", "false");
    await user.click(historyButton);
    expect(historyButton).toHaveAttribute("aria-expanded", "true");

    const panel = screen.getByRole("region", { name: "Groceries history" });
    expect(within(panel).getByText("Cleo Creator")).toBeInTheDocument();
    expect(within(panel).getByText("edited")).toBeInTheDocument();
    // The shared HistoryList renders the Category fields with their labels.
    expect(within(panel).getAllByText("Name:").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Color:").length).toBeGreaterThan(0);
    // "Food" appears as the edit's `from` and the create's `to` — both render.
    expect(within(panel).getAllByText("Food")).toHaveLength(2);

    // Collapses again.
    await user.click(historyButton);
    expect(screen.queryByRole("region", { name: "Groceries history" })).not.toBeInTheDocument();
  });

  it("shows the empty history state for a row with no events", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategoryView()], categoryHistory: [] });

    await user.click(screen.getByRole("button", { name: "History of Groceries" }));

    const panel = screen.getByRole("region", { name: "Groceries history" });
    expect(within(panel).getByText("No history yet.")).toBeInTheDocument();
  });
});
