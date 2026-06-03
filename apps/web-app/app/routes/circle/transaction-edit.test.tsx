import { currentMonth } from "@spend-circle/domain";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Circle, Transaction } from "~/lib/data.js";
import {
  configureConvex,
  makeCategoryView,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  renderCircleRoutes,
} from "~/test/convex-react.js";

/**
 * Behavior test for the Transaction edit OBJECT route (jsdom, TXN-5/ADR 0016/0017).
 * Doubles ONLY Convex's reactive client and runs the REAL route + the REAL
 * `useResolvedTransaction` adapter + the REAL `useResolvedRef` state machine under a
 * REAL router, so the edit deep link's resolution — fetch-by-id, stale-slug
 * canonicalization, unavailable fallback, and the archived-Circle read-only redirect —
 * is exercised exactly as in the app. The prefilled-form FIELD behavior is covered in
 * `transaction-form.test.tsx`; here we assert the route, not the field rules.
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import TransactionEdit from "./transaction-edit.js";

const REF = "trip-c1";
const updateTransaction = vi.fn();

const ROUTES = (
  <>
    {/* The fallback / return target; a placeholder is enough to assert the URL landed. */}
    <Route path="circles/:circleRef/transactions" element={<div>ledger</div>} />
    <Route
      path="circles/:circleRef/transactions/:transactionRef/edit"
      element={<TransactionEdit />}
    />
  </>
);

function setup(
  opts: {
    circle?: Partial<Circle>;
    editableTransaction?: Transaction | null | undefined;
    url?: string;
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  updateTransaction.mockReset();
  updateTransaction.mockResolvedValue("t1");
  configureConvex({
    // The default fixture Transaction is attached to "Groceries"; the edit form must be
    // able to resolve that already-attached Category, so it's in the loaded list.
    categories: [makeCategoryView()],
    members: [makeMemberView()],
    editableTransaction: opts.editableTransaction,
    updateTransaction,
  });
  const url = opts.url ?? `/circles/${REF}/transactions/weekly-shop-t1/edit?month=2026-05`;
  return renderCircleRoutes(circle, ROUTES, { initialEntries: [url] });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TransactionEdit — resolution", () => {
  it("shows a splash while the edit target resolves", () => {
    setup({ editableTransaction: undefined }); // query still loading
    expect(screen.getByText("Opening transaction…")).toBeInTheDocument();
  });

  it("renders the prefilled edit form when the target resolves", () => {
    setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    const form = screen.getByRole("form", { name: /edit transaction/i });
    expect(within(form).getByLabelText("Title")).toHaveValue("Weekly shop");
  });

  it("canonicalizes a stale title slug in place, preserving the month", async () => {
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/stale-slug-t1/edit?month=2026-05`,
    });
    await waitFor(() =>
      expect(location()).toBe(`/circles/${REF}/transactions/weekly-shop-t1/edit?month=2026-05`),
    );
  });
});

describe("TransactionEdit — unavailable target (anti-enumeration)", () => {
  it("falls back to the ledger with the month preserved and shows the generic snackbar", async () => {
    const { location } = setup({ editableTransaction: null });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
  });

  it("falls back to the current month when the edit URL has no valid month", async () => {
    const { location } = setup({
      editableTransaction: null,
      url: `/circles/${REF}/transactions/weekly-shop-t1/edit`,
    });
    await waitFor(() =>
      expect(location()).toBe(`/circles/${REF}/transactions?month=${currentMonth(new Date())}`),
    );
  });
});

describe("TransactionEdit — return navigation", () => {
  it("returns to the ledger month on cancel, even when the transaction is off that month", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      // The edited Transaction is in September, but the ledger context is May — closing
      // must return to May, not jump to the Transaction's own month (ADR 0017).
      editableTransaction: makeTransactionView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        date: "2026-09-15",
        month: "2026-09",
      }),
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`);
  });

  it("returns to the ledger month after a successful save", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalled());
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
  });
});

describe("TransactionEdit — archived Circle stays read-only in place", () => {
  it("redirects an edit link to the read-only ledger without ejecting through unavailable", async () => {
    const { location } = setup({
      circle: { status: "archived" },
      // Even with a resolvable target, an archived Circle is read-only: no edit form.
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
    // Read-only redirect, not the unavailable-link path — no snackbar.
    expect(screen.queryByText("That link isn't available.")).not.toBeInTheDocument();
  });
});
