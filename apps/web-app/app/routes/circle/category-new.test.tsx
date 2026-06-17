import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Circle } from "~/lib/data.js";
import { configureConvex, makeCircleView, renderCircleRoutes } from "~/test/convex-react.js";

/**
 * Behavior test for the new-Category OBJECT route (jsdom, issue #96). Doubles ONLY Convex's
 * reactive client and runs the REAL route + REAL `NewCategoryForm` + REAL `~/lib/data.js`
 * hooks under a REAL router, so the create page's `type` param, `returnTo` lifecycle, and
 * archived/invalid-`type` guards are exercised exactly as in the app (ADR 0006).
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CategoryNew from "./category-new.js";

const REF = "trip-c1";
const createCategory = vi.fn();

// The validated `returnTo` origin a create page is opened with (issue #123): a filtered
// categories list. Close / save / invalid-`type` / archived redirect all land back here.
const LIST_ORIGIN = `/circles/${REF}/categories?type=expense&status=all&q=food`;
const LIST = encodeURIComponent(LIST_ORIGIN);

const ROUTES = (
  <>
    <Route path="circles/:circleRef/categories" element={<div>categories list</div>} />
    <Route path="circles/:circleRef/categories/new" element={<CategoryNew />} />
  </>
);

function setup(opts: { circle?: Partial<Circle>; url?: string } = {}) {
  const circle = makeCircleView(opts.circle);
  createCategory.mockReset();
  createCategory.mockResolvedValue("new-id");
  configureConvex({ createCategory });
  const url = opts.url ?? `/circles/${REF}/categories/new?type=expense&returnTo=${LIST}`;
  return renderCircleRoutes(circle, ROUTES, { initialEntries: [url] });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CategoryNew — render and submit", () => {
  it("renders the expense create form for ?type=expense", () => {
    setup();
    expect(screen.getByLabelText(/New expense category/)).toBeInTheDocument();
  });

  it("renders the income create form for ?type=income", () => {
    setup({ url: `/circles/${REF}/categories/new?type=income&returnTo=${LIST}` });
    expect(screen.getByLabelText(/New income category/)).toBeInTheDocument();
  });

  it("submits the entered name, the URL type, and the selected color", async () => {
    const user = userEvent.setup();
    setup();
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

  it("deep-links the income type from the URL", async () => {
    const user = userEvent.setup();
    setup({ url: `/circles/${REF}/categories/new?type=income&returnTo=${LIST}` });
    await user.type(screen.getByLabelText(/New income category/), "Bonus");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ type: "income" }));
  });

  it("disables the submit button until a name is entered", async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getByRole("button", { name: "Add category" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/New expense category/), "Dining");
    expect(submit).toBeEnabled();
  });
});

describe("CategoryNew — return navigation", () => {
  it("returns to the returnTo origin after a successful create", async () => {
    const user = userEvent.setup();
    const { location } = setup();
    await user.type(screen.getByLabelText(/New expense category/), "Dining");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(createCategory).toHaveBeenCalled());
    await waitFor(() => expect(location()).toBe(LIST_ORIGIN));
  });

  it("returns to the returnTo origin on cancel", async () => {
    const user = userEvent.setup();
    const { location } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(LIST_ORIGIN);
  });

  it("falls back to the bare list when there is no returnTo", async () => {
    const user = userEvent.setup();
    const { location } = setup({ url: `/circles/${REF}/categories/new?type=expense` });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(`/circles/${REF}/categories`);
  });

  it("falls back to the bare list for a tampered (protocol-relative) returnTo — no open redirect", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      url: `/circles/${REF}/categories/new?type=expense&returnTo=${encodeURIComponent("//evil.com")}`,
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(`/circles/${REF}/categories`);
  });
});

describe("CategoryNew — inline errors stay on the page", () => {
  it("surfaces the unique-name rejection inline", async () => {
    const user = userEvent.setup();
    setup();
    createCategory.mockRejectedValueOnce(
      new Error("A category with this name already exists for this type"),
    );
    await user.type(screen.getByLabelText(/New expense category/), "Groceries");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("shows a generic error for an unexpected failure", async () => {
    const user = userEvent.setup();
    setup();
    createCategory.mockRejectedValueOnce(new Error("Network down"));
    await user.type(screen.getByLabelText(/New expense category/), "Groceries");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't create the category/i);
    expect(alert).not.toHaveTextContent(/Network down/);
  });
});

describe("CategoryNew — guards", () => {
  it("redirects to the returnTo origin when `type` is missing", async () => {
    const { location } = setup({ url: `/circles/${REF}/categories/new?returnTo=${LIST}` });
    await waitFor(() => expect(location()).toBe(LIST_ORIGIN));
    expect(screen.queryByLabelText(/New .* category/)).not.toBeInTheDocument();
  });

  it("redirects to the returnTo origin for an invalid `type`", async () => {
    const { location } = setup({
      url: `/circles/${REF}/categories/new?type=nonsense&returnTo=${LIST}`,
    });
    await waitFor(() => expect(location()).toBe(LIST_ORIGIN));
  });

  it("redirects an archived Circle to the returnTo origin without showing the form", async () => {
    const { location } = setup({ circle: { status: "archived" } });
    await waitFor(() => expect(location()).toBe(LIST_ORIGIN));
    expect(screen.queryByLabelText(/New expense category/)).not.toBeInTheDocument();
  });
});
