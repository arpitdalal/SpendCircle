import { api } from "@spend-circle/convex";
import { addMonths, currentMonth } from "@spend-circle/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
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
  type TransactionFilterOptions,
} from "~/lib/data.js";
import {
  configureConvex,
  convexReactMock,
  makeCategoryView,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  renderCircleRoutes,
  testId,
} from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleTransactions from "./transactions.js";

const REF = "trip-c1";
const NOW_MONTH = currentMonth(new Date());
const FILTER_LEDGER = getFunctionName(api.search.filterLedgerTransactions);

const createTransaction = vi.fn();
const archiveTransaction = vi.fn();
const restoreTransaction = vi.fn();
const paginatedLoadMore = vi.fn();

const ROUTES = (
  <>
    <Route path="circles/:circleRef/transactions" element={<CircleTransactions />} />
    <Route
      path="circles/:circleRef/transactions/:transactionRef"
      element={<div>detail page</div>}
    />
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
    filteredTransactions?: Transaction[];
    status?: PaginationStatus;
    monthlySummary?: MonthlySummary | null;
    filterOptions?:
      | TransactionFilterOptions
      | null
      | ((args: Record<string, unknown>) => TransactionFilterOptions | null | undefined);
    initialEntries?: string[];
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  createTransaction.mockReset();
  createTransaction.mockResolvedValue("new-id");
  archiveTransaction.mockReset();
  archiveTransaction.mockResolvedValue("t1");
  restoreTransaction.mockReset();
  restoreTransaction.mockResolvedValue("t1");
  paginatedLoadMore.mockReset();
  configureConvex({
    categories: [makeCategoryView()],
    members: [makeMemberView()],
    transactions: opts.transactions,
    transactionsStatus: opts.status,
    ledgerFilterTransactions: opts.filteredTransactions,
    ledgerFilterStatus: opts.status,
    ledgerFilterOptions: opts.filterOptions ?? makeFilterOptions(),
    ...(opts.monthlySummary === undefined ? {} : { monthlySummary: opts.monthlySummary }),
    loadMore: paginatedLoadMore,
    createTransaction,
    archiveTransaction,
    restoreTransaction,
  });
  const initialEntries = opts.initialEntries ?? [`/circles/${REF}/transactions?month=2026-05`];
  return { circle, ...renderCircleRoutes(circle, ROUTES, { initialEntries }) };
}

function makeFilterOptions(): TransactionFilterOptions {
  return {
    categories: [
      makeCategoryView({ id: testId<Category["id"]>("cat-grocery"), name: "Groceries" }),
      makeCategoryView({
        id: testId<Category["id"]>("cat-rent"),
        name: "Rent",
        status: "archived",
      }),
    ],
    members: [
      makeMemberView({ id: testId<Member["id"]>("mem-you"), displayName: "You" }),
      makeMemberView({
        id: testId<Member["id"]>("mem-alex"),
        displayName: "Alex",
        status: "removed",
      }),
    ],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleTransactions", () => {
  it("normalizes the bare route to month + default ledger filter params", async () => {
    const { location } = setup({ initialEntries: [`/circles/${REF}/transactions`] });
    await waitFor(() =>
      expect(location()).toBe(
        `/circles/${REF}/transactions?month=${NOW_MONTH}&type=all&status=all`,
      ),
    );
    expect(screen.getByLabelText("Month")).toHaveValue(NOW_MONTH);
  });

  it("uses the ledger filter query with status=all by default (no base-list shortcut)", async () => {
    setup({ filteredTransactions: [makeTransactionView({ title: "Weekly shop" })] });

    expect(screen.getByText("Weekly shop")).toBeInTheDocument();
    await waitFor(() => {
      const filterCall = convexReactMock.usePaginatedQuery.mock.calls.find(
        ([fn]) => getFunctionName(fn) === FILTER_LEDGER,
      );
      expect(filterCall?.[1]).not.toBe("skip");
    });
  });

  it("applies ledger filters only when Apply is clicked and leaves monthly totals unchanged", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      transactions: [makeTransactionView({ title: "Weekly shop" })],
      filteredTransactions: [makeTransactionView({ title: "Rent payment" })],
      monthlySummary: {
        totals: { incomeMinor: 0, expenseMinor: 12_500, netMinor: -12_500 },
        currency: "USD",
      },
    });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search title or note" }), {
      target: { value: "rent" },
    });
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(location()).toBe(
      `/circles/${REF}/transactions?month=2026-05&type=all&status=all&q=rent`,
    );
    expect(screen.getByText("Rent payment")).toBeInTheDocument();
    expect(screen.getAllByText(/\$125\.00/)).toHaveLength(2);
  });

  it("resets filters when the selected month changes", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [
        `/circles/${REF}/transactions?month=2026-05&type=expense&status=archived&q=rent`,
      ],
    });

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(location()).toBe(
      `/circles/${REF}/transactions?month=${addMonths("2026-05", -1)}&type=all&status=all`,
    );
  });

  it("resets from the panel immediately to canonical defaults", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [
        `/circles/${REF}/transactions?month=2026-05&type=expense&status=archived&q=rent`,
      ],
    });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(location()).toBe(`/circles/${REF}/transactions?month=2026-05&type=all&status=all`);
  });

  it("carries only month to detail and edit object routes", async () => {
    const user = userEvent.setup();
    const txn = makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" });
    const { location } = setup({
      filteredTransactions: [txn],
      initialEntries: [
        `/circles/${REF}/transactions?month=2026-05&type=expense&status=archived&q=rent`,
      ],
    });

    await user.click(screen.getByRole("link", { name: "View Weekly shop" }));
    expect(location()).toBe(`/circles/${REF}/transactions/weekly-shop-t1?month=2026-05`);
  });

  it("opens create form from the add CTA and keeps month/filter URL state", async () => {
    const user = userEvent.setup();
    const { location } = setup();
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(location()).toBe(
      `/circles/${REF}/transactions?month=2026-05&type=all&status=all&new=expense`,
    );
    expect(screen.getByRole("form", { name: /add expense/i })).toBeInTheDocument();
  });

  it("archives and restores ledger rows through lifecycle actions", async () => {
    const user = userEvent.setup();
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&type=all&status=archived`],
      filteredTransactions: [
        makeTransactionView({ title: "Old buy", status: "archived", canArchive: true }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Restore Old buy" }));
    expect(restoreTransaction).toHaveBeenCalledWith({
      transactionId: testId<Transaction["id"]>("t1"),
    });
  });

  it("offers per-row lifecycle actions in the mixed status=all view", () => {
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&type=all&status=all`],
      filteredTransactions: [
        makeTransactionView({ ref: "active-t", title: "Active buy", status: "active" }),
        makeTransactionView({
          id: testId<Transaction["id"]>("t2"),
          ref: "archived-t",
          title: "Archived buy",
          status: "archived",
        }),
      ],
    });

    // A row's action is derived from its own status, so the mixed list isn't a dead view:
    // active rows Archive, archived rows Restore.
    expect(screen.getByRole("button", { name: "Archive Active buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Archived buy" })).toBeInTheDocument();
  });

  it("does not rewrite applied filters when the open panel's draft type changes the options", async () => {
    const user = userEvent.setup();
    const url = `/circles/${REF}/transactions?month=2026-05&type=expense&status=active&categories=cat-grocery`;
    const { location } = setup({
      initialEntries: [url],
      filteredTransactions: [makeTransactionView({ title: "Weekly shop" })],
      // Options narrow by type: the applied expense category vanishes from the income set.
      filterOptions: (args) =>
        args.type === "income"
          ? {
              categories: [
                makeCategoryView({ id: testId<Category["id"]>("cat-salary"), name: "Salary" }),
              ],
              members: [
                makeMemberView({ id: testId<Member["id"]>("mem-you"), displayName: "You" }),
              ],
            }
          : {
              categories: [
                makeCategoryView({ id: testId<Category["id"]>("cat-grocery"), name: "Groceries" }),
              ],
              members: [
                makeMemberView({ id: testId<Member["id"]>("mem-you"), displayName: "You" }),
              ],
            },
    });

    await waitFor(() => expect(location()).toBe(url));

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Income" }));

    // Draft edits never touch the applied URL — the still-applied expense category survives
    // even though the income draft's option set no longer contains it.
    expect(location()).toBe(url);
  });

  it("renders Load more and pages by the shared page size", async () => {
    const user = userEvent.setup();
    setup({ filteredTransactions: [makeTransactionView()], status: "CanLoadMore" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(paginatedLoadMore).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE);
  });

  it("hides write actions in archived circles", () => {
    setup({ circle: { status: "archived" }, filteredTransactions: [makeTransactionView()] });
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
    expect(within(screen.getByRole("listitem")).queryByRole("link", { name: /Edit/ })).toBeNull();
  });
});
