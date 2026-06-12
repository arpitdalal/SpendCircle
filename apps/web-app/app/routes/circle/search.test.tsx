import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Category,
  type Circle,
  type Member,
  type PaginationStatus,
  TRANSACTIONS_PAGE_SIZE,
  type Transaction,
  type TransactionFilterOptions,
} from "~/lib/data.js";
import {
  configureConvex,
  flushIntersectionObserverStub,
  installIntersectionObserverStub,
  makeCategoryView,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  renderCircleRoutes,
  testId,
} from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);
vi.mock(
  "convex-helpers/react",
  async () => (await import("~/test/convex-react.js")).convexHelpersReactMock,
);

import CircleSearch from "./search.js";

const REF = "trip-c1";

const searchPaginatedLoadMore = vi.fn();

const ROUTES = (
  <>
    <Route path="circles/:circleRef/search" element={<CircleSearch />} />
    <Route
      path="circles/:circleRef/transactions/:transactionRef"
      element={<div>detail page</div>}
    />
  </>
);

function setup(
  opts: {
    circle?: Partial<Circle>;
    searchTransactions?: Transaction[];
    options?:
      | TransactionFilterOptions
      | null
      | ((args: Record<string, unknown>) => TransactionFilterOptions | null | undefined);
    initialEntries?: string[];
    searchStatus?: PaginationStatus;
    loadMore?: () => void;
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  configureConvex({
    searchTransactions: opts.searchTransactions,
    transactionSearchOptions: opts.options ?? makeSearchOptions(),
    ...(opts.searchStatus !== undefined ? { searchStatus: opts.searchStatus } : {}),
    ...(opts.loadMore !== undefined ? { loadMore: opts.loadMore } : {}),
  });
  const initialEntries = opts.initialEntries ?? [`/circles/${REF}/search`];
  return { circle, ...renderCircleRoutes(circle, ROUTES, { initialEntries }) };
}

function makeSearchOptions(): TransactionFilterOptions {
  return {
    categories: [
      makeCategoryView({ id: testId<Category["id"]>("cat-grocery"), name: "Groceries" }),
      makeCategoryView({
        id: testId<Category["id"]>("cat-salary"),
        name: "Salary",
        type: "income",
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

describe("CircleSearch", () => {
  it("normalizes bare search to default filters and shows default results", async () => {
    const { location } = setup({
      searchTransactions: [makeTransactionView({ title: "Weekly shop" })],
    });

    await waitFor(() => expect(location()).toBe(`/circles/${REF}/search?type=all&status=all`));
    expect(screen.getByText("Weekly shop")).toBeInTheDocument();
  });

  it("does not change the URL until Search is submitted", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/search?type=all&status=active`],
    });

    await user.type(screen.getByRole("searchbox", { name: "Search title or note" }), "rent");
    expect(location()).toBe(`/circles/${REF}/search?type=all&status=active`);
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(location()).toBe(`/circles/${REF}/search?type=all&status=active&q=rent`);
  });

  it("applies advanced filters through the panel", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/search?type=all&status=all`],
      searchTransactions: [makeTransactionView({ title: "Archived rent", status: "archived" })],
    });

    // Start from the canonical default (status=all), so the Filters button carries no count.
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Archived" }));
    await user.click(screen.getByRole("button", { name: "Expense" }));
    await user.type(screen.getByLabelText("From"), "2026-05-01");
    await user.type(screen.getByLabelText("To"), "2026-05-31");
    await user.type(screen.getByLabelText("Amount min"), "10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(location()).toBe(
      `/circles/${REF}/search?type=expense&status=archived&from=2026-05-01&to=2026-05-31&min=10`,
    );
  });

  it("resets immediately to canonical default search", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/search?type=expense&status=all&q=rent`],
    });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(location()).toBe(`/circles/${REF}/search?type=all&status=all`);
  });

  it("does not rewrite applied filters when the open panel's draft type changes the options", async () => {
    const user = userEvent.setup();
    const url = `/circles/${REF}/search?type=expense&status=active&categories=cat-grocery`;
    const { location } = setup({
      initialEntries: [url],
      // Options narrow by type: the applied expense category vanishes from the income set.
      options: (args) =>
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

  it("opens a result detail without search params", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      initialEntries: [`/circles/${REF}/search?type=all&status=active&q=rent`],
      searchTransactions: [makeTransactionView({ ref: "rent-t1", title: "Rent" })],
    });

    await user.click(screen.getByRole("link", { name: "View Rent" }));
    expect(location()).toBe(`/circles/${REF}/transactions/rent-t1`);
  });
});

describe("CircleSearch — infinite scroll pagination", () => {
  installIntersectionObserverStub();

  it("loads the next page when the sentinel intersects (searchTransactions)", () => {
    setup({
      searchTransactions: [makeTransactionView()],
      searchStatus: "CanLoadMore",
      loadMore: searchPaginatedLoadMore,
    });
    expect(screen.getByTestId("transactions-infinite-scroll-sentinel")).toBeInTheDocument();
    flushIntersectionObserverStub(true);
    expect(searchPaginatedLoadMore).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE);
  });

  it("shows loading status while LoadingMore on search results", () => {
    setup({
      searchTransactions: [makeTransactionView()],
      searchStatus: "LoadingMore",
      loadMore: searchPaginatedLoadMore,
    });
    expect(screen.getByRole("status", { name: "Transaction list" })).toHaveTextContent(
      /loading more transactions/i,
    );
    expect(screen.queryByTestId("transactions-infinite-scroll-sentinel")).not.toBeInTheDocument();
  });
});
