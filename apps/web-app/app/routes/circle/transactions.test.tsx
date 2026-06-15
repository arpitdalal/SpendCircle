import { api } from "@spend-circle/convex";
import { addMonths, currentMonth } from "@spend-circle/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
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
  flushIntersectionObserverStub,
  installIntersectionObserverStub,
  makeCategoryView,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  pickCombobox,
  pickTransactionFormCategory,
  renderCircleRoutes,
  testId,
} from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);
vi.mock(
  "convex-helpers/react",
  async () => (await import("~/test/convex-react.js")).convexHelpersReactMock,
);

import CircleTransactions from "./transactions.js";

const REF = "trip-c1";
const NOW_MONTH = currentMonth(new Date());
const FILTER_LEDGER = getFunctionName(api.search.filterLedgerTransactions);
/** Matches `assertWritable` in `packages/convex/convex/guard.ts` — realistic prod rejection. */
const ARCHIVED_CIRCLE_ERROR = new ConvexError("Circle is archived");

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

  it("drives the list from the ledger filter query with status=all by default", async () => {
    setup({ filteredTransactions: [makeTransactionView({ title: "Weekly shop" })] });

    expect(screen.getByText("Weekly shop")).toBeInTheDocument();
    // One query owns the list — no active-only base-list shortcut — so the unfiltered
    // default is a live status=all read, not skipped.
    await waitFor(() => {
      const filterCall = convexReactMock.usePaginatedQuery.mock.calls.find(
        ([fn]) => getFunctionName(fn) === FILTER_LEDGER,
      );
      expect(filterCall?.[1]).toMatchObject({ status: "all" });
    });
  });

  it("applies ledger filters only when Apply is clicked and leaves monthly totals unchanged", async () => {
    const user = userEvent.setup();
    const { location } = setup({
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

  it("applies ledger filters when Enter is pressed in the panel search field (same as Apply)", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      filteredTransactions: [makeTransactionView({ title: "Rent payment" })],
      monthlySummary: {
        totals: { incomeMinor: 0, expenseMinor: 12_500, netMinor: -12_500 },
        currency: "USD",
      },
    });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const searchbox = within(dialog).getByRole("searchbox", { name: "Search title or note" });
    await user.click(searchbox);
    await user.clear(searchbox);
    await user.type(searchbox, "rent{Enter}");

    expect(location()).toBe(
      `/circles/${REF}/transactions?month=2026-05&type=all&status=all&q=rent`,
    );
    expect(screen.getByText("Rent payment")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("applies a category filter from the combobox to the URL", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05`],
    });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    await pickCombobox(user, dialog, "Categories", "Groceries");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(location()).toMatch(/categories=cat-grocery/);
  });

  it("filters category options by detail text, not just label", async () => {
    const user = userEvent.setup();
    setup({ initialEntries: [`/circles/${REF}/transactions?month=2026-05`] });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const combobox = within(dialog).getByRole("combobox", { name: "Categories" });
    await user.click(combobox);
    await user.type(combobox, "archived");

    // "archived" matches Rent's detail marker only — its label doesn't contain it.
    expect(await screen.findByRole("option", { name: /Rent/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Groceries/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
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

  it("clears the busy label after a lifecycle action when the row flips in place (#82)", async () => {
    const user = userEvent.setup();
    // The mixed status=all view keeps the row mounted across the archive: its `<li key>`
    // is the stable id, so the LifecycleButton instance (and its in-flight flag) survives
    // the reactive flip from active→archived. A backing array we mutate in place models
    // that reactive update arriving after the mutation resolves.
    const rows = [
      makeTransactionView({ title: "Weekly shop", status: "active", canArchive: true }),
    ];
    const { rerender } = setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&type=all&status=all`],
      filteredTransactions: rows,
    });

    await user.click(screen.getByRole("button", { name: "Archive Weekly shop" }));
    expect(archiveTransaction).toHaveBeenCalledWith({
      transactionId: testId<Transaction["id"]>("t1"),
    });

    // The reactive ledger query pushes the now-archived row; the row flips to the Restore
    // action in place.
    rows[0] = makeTransactionView({ title: "Weekly shop", status: "archived", canArchive: true });
    rerender();

    // The button must settle on the new action's IDLE label — not strand on the opposite
    // action's busy label ("Restoring…"/"Archiving…") because the in-flight flag was never
    // cleared on success (#82). Accessible name is always the idle copy, so assert the
    // VISIBLE text and that the button is interactive again.
    const button = await screen.findByRole("button", { name: "Restore Weekly shop" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent(/^Restore$/);
  });

  it("offers per-row lifecycle actions and an archived marker in the mixed status=all view", () => {
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

    // The archived row is distinguished by an "Archived" marker so the mixed default view
    // stays readable; the active row carries none, so exactly one marker shows. The marker
    // sits on the archived row (its `<li>` also holds that row's "Archived buy" title).
    const marker = screen.getByText("Archived", { exact: true });
    expect(screen.getAllByText("Archived", { exact: true })).toHaveLength(1);
    expect(marker.closest("li")).toHaveTextContent("Archived buy");
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

  it("hides write actions in archived circles", () => {
    setup({ circle: { status: "archived" }, filteredTransactions: [makeTransactionView()] });
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
    expect(within(screen.getByRole("listitem")).queryByRole("link", { name: /Edit/ })).toBeNull();
  });

  it("surfaces archived-circle rejection on create submit and re-enables the form", async () => {
    const user = userEvent.setup();
    setup();
    createTransaction.mockRejectedValue(ARCHIVED_CIRCLE_ERROR);
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Late entry");
    await user.type(within(form).getByLabelText(/Amount/), "10");
    await pickTransactionFormCategory(user, form, "Groceries");
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    expect(await within(form).findByText("Circle is archived")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(form).getByRole("button", { name: "Add expense" })).toBeEnabled(),
    );
  });

  it("treats plain Error with archived message on create as generic fallback", async () => {
    const user = userEvent.setup();
    setup();
    createTransaction.mockRejectedValue(new Error("Circle is archived"));
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Late entry");
    await user.type(within(form).getByLabelText(/Amount/), "10");
    await pickTransactionFormCategory(user, form, "Groceries");
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    expect(
      await within(form).findByText("Couldn't save the transaction. Please try again."),
    ).toBeInTheDocument();
    expect(within(form).queryByText("Circle is archived", { exact: true })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(form).getByRole("button", { name: "Add expense" })).toBeEnabled(),
    );
  });

  it("surfaces archived-circle rejection on archive and re-enables the button", async () => {
    const user = userEvent.setup();
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&type=all&status=all`],
      filteredTransactions: [
        makeTransactionView({ title: "Weekly shop", status: "active", canArchive: true }),
      ],
    });
    archiveTransaction.mockRejectedValue(ARCHIVED_CIRCLE_ERROR);
    await user.click(screen.getByRole("button", { name: "Archive Weekly shop" }));
    expect(await screen.findByText("Circle is archived")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Archive Weekly shop" })).toBeEnabled(),
    );
  });

  it("surfaces archived-circle rejection on restore and re-enables the button", async () => {
    const user = userEvent.setup();
    setup({
      initialEntries: [`/circles/${REF}/transactions?month=2026-05&type=all&status=archived`],
      filteredTransactions: [
        makeTransactionView({ title: "Old buy", status: "archived", canArchive: true }),
      ],
    });
    restoreTransaction.mockRejectedValue(ARCHIVED_CIRCLE_ERROR);
    await user.click(screen.getByRole("button", { name: "Restore Old buy" }));
    expect(await screen.findByText("Circle is archived")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Restore Old buy" })).toBeEnabled(),
    );
  });
});

describe("CircleTransactions — infinite scroll pagination", () => {
  installIntersectionObserverStub();

  it("loads the next page when the sentinel intersects (loadMore with page size)", () => {
    setup({ filteredTransactions: [makeTransactionView()], status: "CanLoadMore" });
    expect(screen.getByTestId("transactions-infinite-scroll-sentinel")).toBeInTheDocument();
    flushIntersectionObserverStub(true);
    expect(paginatedLoadMore).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE);
  });

  it("does not call loadMore when the observer reports no intersection", () => {
    setup({ filteredTransactions: [makeTransactionView()], status: "CanLoadMore" });
    flushIntersectionObserverStub(false);
    expect(paginatedLoadMore).not.toHaveBeenCalled();
  });

  it("shows loading status while LoadingMore; no sentinel and no Load more button", () => {
    setup({ filteredTransactions: [makeTransactionView()], status: "LoadingMore" });
    expect(screen.getByRole("status", { name: "Transaction list" })).toHaveTextContent(
      /loading more transactions/i,
    );
    expect(screen.queryByTestId("transactions-infinite-scroll-sentinel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("hides sentinel when exhausted; live region without loading copy", () => {
    setup({ filteredTransactions: [makeTransactionView()], status: "Exhausted" });
    expect(screen.queryByTestId("transactions-infinite-scroll-sentinel")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Transaction list" })).not.toHaveTextContent(
      /loading more/i,
    );
  });
});
