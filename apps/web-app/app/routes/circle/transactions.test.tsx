import { addMonths, currentMonth } from "@spend-circle/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Category,
  type Circle,
  type Member,
  type MonthlySummary,
  type PaginationStatus,
  TRANSACTIONS_PAGE_SIZE,
  type Transaction,
} from "~/lib/data.js";
import {
  configureConvex,
  makeCategoryView,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  renderCircleRoutes,
  testId,
} from "~/test/convex-react.js";

/**
 * Behavior test for the Monthly Ledger route (jsdom). Doubles ONLY Convex's reactive
 * client (via the shared helper) and runs the REAL route under a REAL router, so the
 * URL-owned state of TXN-5 — the `month` query, the `new` create param, and the Edit
 * object link — is exercised against `useSearchParams`/`Link` exactly as in the app
 * (ADR 0006/0017). Form FIELD behavior lives in `transaction-form.test.tsx`; this file
 * is about the ledger surface and its URL contract.
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleTransactions from "./transactions.js";

/** The fixture Circle's canonical ref (`makeCircleView` default), used to build URLs. */
const REF = "trip-c1";
const NOW_MONTH = currentMonth(new Date());

const createTransaction = vi.fn();
const updateTransaction = vi.fn();
const paginatedLoadMore = vi.fn();

const ROUTES = (
  <>
    <Route path="circles/:circleRef/transactions" element={<CircleTransactions />} />
    {/* A placeholder edit target so an Edit-link click resolves to a known node and the
        location probe updates; the real edit route is tested in transaction-edit.test. */}
    <Route
      path="circles/:circleRef/transactions/:transactionRef/edit"
      element={<div>edit page</div>}
    />
  </>
);

function setup(
  opts: {
    circle?: Partial<Circle>;
    transactions?: Transaction[];
    status?: PaginationStatus;
    categories?: Category[] | null;
    members?: Member[] | null;
    monthlySummary?: MonthlySummary | null;
    initialEntries?: string[];
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  createTransaction.mockReset();
  createTransaction.mockResolvedValue("new-id");
  updateTransaction.mockReset();
  updateTransaction.mockResolvedValue("t1");
  configureConvex({
    categories: opts.categories === undefined ? [makeCategoryView()] : opts.categories,
    members: opts.members === undefined ? [makeMemberView()] : opts.members,
    transactions: opts.transactions,
    transactionsStatus: opts.status,
    ...(opts.monthlySummary === undefined ? {} : { monthlySummary: opts.monthlySummary }),
    loadMore: paginatedLoadMore,
    createTransaction,
    updateTransaction,
  });
  const initialEntries = opts.initialEntries ?? [`/circles/${REF}/transactions?month=2026-05`];
  return { circle, ...renderCircleRoutes(circle, ROUTES, { initialEntries }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleTransactions — list & states", () => {
  it("shows a month-named empty state when the month has no transactions", () => {
    setup({ transactions: [] });
    expect(screen.getByText("No transactions in May 2026.")).toBeInTheDocument();
  });

  it("shows a loading state while the first page resolves", () => {
    setup({ transactions: [], status: "LoadingFirstPage" });
    expect(screen.getByText(/Loading transactions/)).toBeInTheDocument();
  });

  it("renders a Load more control and pages the source by the page size", async () => {
    const user = userEvent.setup();
    setup({ transactions: [makeTransactionView()], status: "CanLoadMore" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(paginatedLoadMore).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE);
  });

  it("disables Load more while the next page is loading", () => {
    setup({ transactions: [makeTransactionView()], status: "LoadingMore" });
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("lists transactions with formatted money and the income sign", () => {
    const txn = makeTransactionView({
      type: "income",
      title: "Paycheck",
      amountMinorUnits: 500000,
      date: "2026-05-31",
      categories: [{ id: testId<Category["id"]>("cat-salary"), name: "Salary", color: "teal" }],
    });
    setup({ transactions: [txn] });
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Paycheck")).toBeInTheDocument();
    expect(within(item).getByText(/\+\$5,000\.00/)).toBeInTheDocument();
  });

  it("hides the CTAs and shows a read-only notice for an archived Circle", () => {
    setup({ circle: { status: "archived" }, transactions: [] });
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
  });
});

describe("CircleTransactions — month URL state (TXN-5)", () => {
  it("replaces a bare route to the current month", async () => {
    const { location } = setup({ initialEntries: [`/circles/${REF}/transactions`] });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=${NOW_MONTH}`));
    expect(screen.getByLabelText("Month")).toHaveValue(NOW_MONTH);
  });

  it("replaces an invalid month to the current month without a snackbar", async () => {
    const { location } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-13`],
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=${NOW_MONTH}`));
    // Normalization is silent — no unavailable-link snackbar for malformed UI state.
    expect(screen.queryByText(/isn't available/i)).not.toBeInTheDocument();
  });

  it("reads the month from the URL and renders it (reload-restorable)", () => {
    setup({ initialEntries: [`/circles/${REF}/transactions?month=2026-03`], transactions: [] });
    expect(screen.getByLabelText("Month")).toHaveValue("2026-03");
    expect(screen.getByText("No transactions in March 2026.")).toBeInTheDocument();
  });

  it("pushes the new month to the URL when navigating", async () => {
    const user = userEvent.setup();
    const { location } = setup();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(location()).toBe(`/circles/${REF}/transactions?month=${addMonths("2026-05", -1)}`);
    expect(screen.getByLabelText("Month")).toHaveValue("2026-04");
  });

  it("jumps to a chosen month via the month input and names it in the empty state", async () => {
    const { location } = setup({ transactions: [] });
    const input = screen.getByLabelText("Month");
    // The draft tracks the input immediately, but commit (and the ledger month) only
    // lands on blur — never per keystroke — so a multi-keystroke year is entered whole.
    fireEvent.change(input, { target: { value: "2026-03" } });
    expect(input).toHaveValue("2026-03");
    fireEvent.blur(input);
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-03`));
    expect(screen.getByLabelText("Month")).toHaveValue("2026-03");
    expect(screen.getByText("No transactions in March 2026.")).toBeInTheDocument();
  });

  it("reverts an emptied month input to the selected month on blur (always has a month)", () => {
    setup({ initialEntries: [`/circles/${REF}/transactions?month=2026-03`], transactions: [] });
    const input = screen.getByLabelText("Month");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    // A cleared/partial value never commits; the input snaps back to the selected month.
    expect(input).toHaveValue("2026-03");
    expect(screen.getByText("No transactions in March 2026.")).toBeInTheDocument();
  });
});

describe("CircleTransactions — create form URL state (TXN-5)", () => {
  it("opens the expense form scoped to expense from the new=expense param", () => {
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=expense`],
      categories: [
        makeCategoryView({ name: "Groceries", type: "expense" }),
        makeCategoryView({ id: testId<Category["id"]>("i1"), name: "Salary", type: "income" }),
      ],
    });
    const form = screen.getByRole("form", { name: /add expense/i });
    expect(within(form).getByRole("button", { name: "Groceries" })).toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("opens the income form from the new=income param", () => {
    setup({ initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=income`] });
    expect(screen.getByRole("form", { name: /add income/i })).toBeInTheDocument();
  });

  it("deep-links new=<type> and keeps the month when an Add CTA is clicked", async () => {
    const user = userEvent.setup();
    const { location } = setup();
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05&new=expense`);
    expect(screen.getByRole("form", { name: /add expense/i })).toBeInTheDocument();
  });

  it("drops an invalid new value while preserving the month", async () => {
    const { location } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=bogus`],
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
    expect(screen.queryByRole("form", { name: /add/i })).not.toBeInTheDocument();
  });

  it("removes only new and keeps the month when the form is closed", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=expense`],
    });
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`);
    expect(screen.queryByRole("form", { name: /add expense/i })).not.toBeInTheDocument();
  });

  it("drops the create form state on a read-only (archived) Circle", async () => {
    const { location } = setup({
      circle: { status: "archived" },
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=expense`],
      transactions: [],
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
    expect(screen.queryByRole("form", { name: /add expense/i })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
  });

  it("closes an open create form in place when the Circle is archived mid-edit", async () => {
    const { rerender, location } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&new=expense`],
    });
    expect(screen.getByRole("form", { name: /add expense/i })).toBeInTheDocument();

    // The Owner archives the Circle while the form is open; the reactive getCircle flips
    // status and the guard layout re-provides it. The Member keeps access (archived ≠
    // inaccessible) so we stay on the route; the write surface collapses in place.
    rerender(makeCircleView({ status: "archived" }));

    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05`));
    expect(screen.queryByRole("form", { name: /add expense/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
  });
});

describe("CircleTransactions — Edit object link (TXN-5)", () => {
  it("links Edit to the canonical edit object route with the selected month preserved", () => {
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05`],
      transactions: [makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" })],
    });
    expect(screen.getByRole("link", { name: "Edit Weekly shop" })).toHaveAttribute(
      "href",
      `/circles/${REF}/transactions/weekly-shop-t1/edit?month=2026-05`,
    );
  });

  it("shows the Edit link only on the viewer's own transactions", () => {
    setup({
      transactions: [
        makeTransactionView({
          id: testId<Transaction["id"]>("mine"),
          title: "Mine",
          canEditFields: true,
        }),
        makeTransactionView({
          id: testId<Transaction["id"]>("theirs"),
          ref: "theirs-t2",
          title: "Theirs",
          canEditFields: false,
        }),
      ],
    });
    expect(screen.getByRole("link", { name: "Edit Mine" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Theirs" })).not.toBeInTheDocument();
  });

  it("hides the Edit link in an archived circle even for own transactions", () => {
    setup({
      circle: { status: "archived" },
      transactions: [makeTransactionView({ title: "Mine", canEditFields: true })],
    });
    expect(screen.queryByRole("link", { name: "Edit Mine" })).not.toBeInTheDocument();
  });
});

describe("CircleTransactions — Monthly Ledger totals (RPT-1)", () => {
  const summaryOf = (
    incomeMinor: number,
    expenseMinor: number,
    netMinor: number,
  ): MonthlySummary => ({
    totals: { incomeMinor, expenseMinor, netMinor },
    currency: "USD",
  });

  it("renders the month's income, expense, and net totals formatted in the currency", () => {
    setup({ monthlySummary: summaryOf(500_000, 8_750, 491_250) });
    const totals = screen.getByRole("group", { name: "Monthly totals" });
    expect(within(totals).getByText("$5,000.00")).toBeInTheDocument();
    expect(within(totals).getByText("$87.50")).toBeInTheDocument();
    expect(within(totals).getByText("$4,912.50")).toBeInTheDocument();
  });

  it("shows a negative net when expenses exceed income", () => {
    setup({ monthlySummary: summaryOf(2_000, 9_000, -7_000) });
    const totals = screen.getByRole("group", { name: "Monthly totals" });
    expect(within(totals).getByText("-$70.00")).toBeInTheDocument();
  });
});
