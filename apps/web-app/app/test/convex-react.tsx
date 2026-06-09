import { api } from "@spend-circle/convex";
import { render } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router";
import { type Mock, vi } from "vitest";
import type {
  Category,
  Circle,
  Dashboard,
  Member,
  MonthlySummary,
  PaginationStatus,
  Transaction,
  TransactionDetail,
  TransactionHistoryEvent,
  TransactionSearchMeta,
} from "~/lib/data.js";
import { SnackbarProvider } from "~/lib/snackbar.js";
import type { CircleOutletContext } from "~/routes/layouts/circle-layout.js";

/**
 * One source of truth for the Convex network boundary in component tests. Every
 * route/component test doubles ONLY `convex/react` (the reactive client) and runs
 * the real `~/lib/data.js` hooks + real route logic against it, per ADR 0006 (mock
 * at the vendor edge, never over our own logic). Install it in a test file with:
 *
 * ```ts
 * vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);
 * ```
 *
 * then drive each test's backend state through {@link configureConvex}. The doubles
 * dispatch by the Convex function's stable name (`module:function`), so they model
 * the backend contract — a test fails if the route subscribes to the wrong query or
 * drops an arg (e.g. `includeArchived`).
 */
export const convexReactMock = {
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  // Imported (not executed) by the Circle layout's resolver that some routes pull
  // in — present so the named import resolves; never relied upon here.
  useConvexAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
};

// Stable function names (`getFunctionName` works on the `anyApi` proxy; reference
// identity does not). The one place query/mutation identity is encoded.
const NAME = {
  listMyCircles: getFunctionName(api.circles.listMyCircles),
  listCategories: getFunctionName(api.categories.listCategories),
  listMembers: getFunctionName(api.members.listMembers),
  listTransactions: getFunctionName(api.transactions.listTransactions),
  getEditableTransaction: getFunctionName(api.transactions.getEditableTransaction),
  getTransaction: getFunctionName(api.transactions.getTransaction),
  listTransactionHistory: getFunctionName(api.transactions.listTransactionHistory),
  searchTransactions: getFunctionName(api.search.searchTransactions),
  getTransactionSearchMeta: getFunctionName(api.search.getTransactionSearchMeta),
  getMonthlyLedger: getFunctionName(api.ledger.getMonthlyLedger),
  getDashboard: getFunctionName(api.dashboard.getDashboard),
  getPaidByFilterOptions: getFunctionName(api.dashboard.getPaidByFilterOptions),
  createCircle: getFunctionName(api.circles.createCircle),
  createTransaction: getFunctionName(api.transactions.createTransaction),
  updateTransaction: getFunctionName(api.transactions.updateTransaction),
  archiveTransaction: getFunctionName(api.transactions.archiveTransaction),
  restoreTransaction: getFunctionName(api.transactions.restoreTransaction),
  createCategory: getFunctionName(api.categories.createCategory),
};

/** A zero Monthly Ledger summary — the default for tests that don't drive totals. */
const EMPTY_MONTHLY_SUMMARY: MonthlySummary = {
  totals: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  currency: "USD",
};

/** A zero Dashboard — the default for tests that don't drive Dashboard state. */
const EMPTY_DASHBOARD: Dashboard = {
  totals: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  recent: [],
  currency: "USD",
  month: "2026-06",
};

/** Models the `listCategories` backend contract: filter by type, optionally include
 * archived. The single definition the doubles share so it cannot drift per file. */
function fakeListCategories(rows: Category[], args: Record<string, unknown>) {
  const includeArchived = args.includeArchived === true;
  return rows.filter((c) => c.type === args.type && (includeArchived || c.status === "active"));
}

interface ConvexState {
  /** `listMyCircles` — `undefined` ≡ loading. */
  circles?: Circle[] | null;
  /** `listCategories` source rows (filtered per query args); `undefined` ≡ loading,
   * `null` ≡ inaccessible Circle (ADR 0016). */
  categories?: Category[] | null;
  /** `listMembers` — `undefined` ≡ loading, `null` ≡ inaccessible. */
  members?: Member[] | null;
  /** `listTransactions` page (paginated) — the ACTIVE-status page. */
  transactions?: Transaction[];
  /** `listTransactions` page for `status: "archived"` — the archived view's page
   * (TXN-3). Dispatched by the query's `status` arg so the active/archived toggle reads
   * two distinct lists; defaults to empty (an archived view with nothing in it). */
  archivedTransactions?: Transaction[];
  transactionsStatus?: PaginationStatus;
  /** The paginated `loadMore`; assert against it for "Load more" wiring. */
  loadMore?: () => void;
  /** `getMonthlyLedger` summary (totals + currency); `undefined` ≡ loading, `null` ≡
   * inaccessible Circle. Defaults to a zero summary so the totals header renders. */
  monthlySummary?: MonthlySummary | null;
  searchTransactions?: Transaction[];
  searchStatus?: PaginationStatus;
  searchMeta?: TransactionSearchMeta | null;
  /** `getDashboard` result; `undefined` ≡ loading, `null` ≡ inaccessible Circle.
   * Defaults to a zero Dashboard so the totals cards render. A function resolves per
   * query args (e.g. by `paidByMemberId`) so a test can model the Paid By filter
   * flipping the result without a loading gap. */
  dashboard?: Dashboard | null | ((args: Record<string, unknown>) => Dashboard | null | undefined);
  /** `getPaidByFilterOptions` result; `undefined` ≡ loading, `null` ≡ inaccessible. */
  paidByFilterOptions?: Member[] | null;
  /** `getEditableTransaction` edit target (TXN-5); `undefined` ≡ loading, `null` ≡
   * unavailable (missing / inaccessible / wrong-Circle / archived / not-editable —
   * all collapsed by the server). Drives the edit object route's resolution. A function
   * resolves per query args (e.g. by `transactionId`) so a test can model two distinct
   * cached targets while navigating edit→edit without a loading gap. */
  editableTransaction?:
    | Transaction
    | null
    | ((args: Record<string, unknown>) => Transaction | null | undefined);
  /** `getTransaction` detail target (TXN-4); `undefined` ≡ loading, `null` ≡ unavailable
   * (missing / inaccessible / wrong-Circle — collapsed by the server). Drives the detail
   * object route's resolution. A function resolves per query args (e.g. by `transactionId`)
   * so a test can model distinct cached targets without a loading gap. */
  transactionDetail?:
    | TransactionDetail
    | null
    | ((args: Record<string, unknown>) => TransactionDetail | null | undefined);
  /** `listTransactionHistory` page (paginated, TXN-4) — the detail surface's history;
   * defaults to empty. */
  transactionHistory?: TransactionHistoryEvent[];
  historyStatus?: PaginationStatus;
  /** The paginated history `loadMore`; assert against it for the history "Load more". */
  historyLoadMore?: () => void;
  /** The `createTransaction` / `createCategory` mutation spies the test owns.
   *
   * These are plain spies the caller configures. To assert the backend-guard
   * *rejection* path (e.g. TXN edit where `assertWritable`/`requireCircleAccess`
   * throws because the Circle was archived or went inaccessible mid-submit), the
   * caller passes a rejecting spy directly — `createTransaction: vi.fn()
   * .mockRejectedValue(new Error("Circle is archived"))` — and asserts the
   * route's error handling. Intentionally NOT abstracted into a dedicated
   * `rejects`/error knob here: no caller needs it yet, and the spy already
   * exposes the full mock surface. Add a typed helper only when the first edit
   * test lands and a shared rejection contract actually emerges — don't invent a
   * second config shape speculatively. */
  /** The `createCircle` mutation spy the test owns (CS-0). Returns the new Circle's id,
   * so a test configures `vi.fn().mockResolvedValue(testId("c-new"))` to drive the
   * create flow's navigation to the canonical ref. */
  createCircle?: Mock;
  createTransaction?: Mock;
  updateTransaction?: Mock;
  archiveTransaction?: Mock;
  restoreTransaction?: Mock;
  createCategory?: Mock;
}

/** Configures what each doubled Convex subscription/mutation returns for one test.
 * Call before rendering so the first render reads the intended state. */
export function configureConvex(state: ConvexState = {}) {
  const {
    circles,
    categories,
    members,
    transactions = [],
    archivedTransactions = [],
    transactionsStatus = "Exhausted",
    loadMore = () => {},
    monthlySummary = EMPTY_MONTHLY_SUMMARY,
    searchTransactions = [],
    searchStatus = "Exhausted",
    searchMeta,
    dashboard = EMPTY_DASHBOARD,
    paidByFilterOptions,
    // No default: absent ≡ `undefined` ≡ loading (the codebase's reactive-query
    // convention); a test passes `null` to model an unavailable edit target.
    editableTransaction,
    transactionDetail,
    transactionHistory = [],
    historyStatus = "Exhausted",
    historyLoadMore = () => {},
    createCircle,
    createTransaction,
    updateTransaction,
    archiveTransaction,
    restoreTransaction,
    createCategory,
  } = state;

  convexReactMock.useQuery.mockImplementation(
    (fn: FunctionReference<"query">, args: Record<string, unknown> | "skip") => {
      if (args === "skip") return undefined;
      switch (getFunctionName(fn)) {
        case NAME.listMyCircles:
          return circles;
        case NAME.listCategories:
          return categories == null ? categories : fakeListCategories(categories, args);
        case NAME.listMembers:
          return members;
        case NAME.getMonthlyLedger:
          return monthlySummary;
        case NAME.getTransactionSearchMeta:
          return searchMeta;
        case NAME.getDashboard:
          return typeof dashboard === "function" ? dashboard(args) : dashboard;
        case NAME.getPaidByFilterOptions:
          return paidByFilterOptions;
        case NAME.getEditableTransaction:
          return typeof editableTransaction === "function"
            ? editableTransaction(args)
            : editableTransaction;
        case NAME.getTransaction:
          return typeof transactionDetail === "function"
            ? transactionDetail(args)
            : transactionDetail;
        default:
          return undefined;
      }
    },
  );

  convexReactMock.usePaginatedQuery.mockImplementation(
    (fn: FunctionReference<"query">, args: Record<string, unknown> | "skip") => {
      const name = getFunctionName(fn);
      if (args === "skip") {
        return { results: [], status: "Exhausted", loadMore: () => {} };
      }
      // The Transaction History list (TXN-4) is its own paginated query.
      if (name === NAME.listTransactionHistory) {
        return { results: transactionHistory, status: historyStatus, loadMore: historyLoadMore };
      }
      if (name === NAME.searchTransactions) {
        return { results: searchTransactions, status: searchStatus, loadMore };
      }
      if (name !== NAME.listTransactions) {
        return { results: [], status: "Exhausted", loadMore: () => {} };
      }
      // The active/archived toggle (TXN-3) reads two distinct pages by the query's
      // `status` arg, so the doubles dispatch on it just as the backend does.
      const archived = args.status === "archived";
      return {
        results: archived ? archivedTransactions : transactions,
        status: transactionsStatus,
        loadMore,
      };
    },
  );

  const noop = vi.fn();
  convexReactMock.useMutation.mockImplementation((fn: FunctionReference<"mutation">) => {
    switch (getFunctionName(fn)) {
      case NAME.createCircle:
        return createCircle ?? noop;
      case NAME.createTransaction:
        return createTransaction ?? noop;
      case NAME.updateTransaction:
        return updateTransaction ?? noop;
      case NAME.archiveTransaction:
        return archiveTransaction ?? noop;
      case NAME.restoreTransaction:
        return restoreTransaction ?? noop;
      case NAME.createCategory:
        return createCategory ?? noop;
      default:
        return noop;
    }
  });
}

function withRouter(node: ReactElement) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

/** Renders a route that reads no Circle context (e.g. Home) under a real router. */
export function renderWithRouter(element: ReactElement) {
  return render(withRouter(element));
}

/** Renders a Circle-scoped route with the Circle supplied through a REAL Outlet
 * context — the same channel the Circle guard layout uses — so the real `useCircle`
 * runs. `rerenderInCircle` rebuilds a fresh element tree so React reconciles (re-
 * reading the query doubles) rather than bailing on an identical element; pass a
 * `nextCircle` to model the reactive `getCircle` flipping (e.g. the Circle archived
 * mid-edit), defaulting to the originally-rendered Circle. */
export function renderInCircle(circle: Circle, element: ReactElement) {
  const wrap = (node: ReactElement, current: Circle) =>
    withRouter(
      <Routes>
        <Route element={<Outlet context={{ circle: current } satisfies CircleOutletContext} />}>
          <Route path="*" element={node} />
        </Route>
      </Routes>,
    );
  const result = render(wrap(element, circle));
  return {
    ...result,
    rerenderInCircle: (node: ReactElement, nextCircle: Circle = circle) =>
      result.rerender(wrap(node, nextCircle)),
  };
}

/**
 * Shared view-shape builders for the Transaction surfaces (the ledger, the form, the
 * edit route). One definition each — typed against the derived `~/lib/data.js`
 * contracts so a `to*View` change fails typecheck here — driven by a partial override
 * so each test states only what differs (CLAUDE.md: one helper, not copy-pasted
 * fixtures tweaked per file). Ids default to stable slugs; pass overrides for the rest.
 */
export function makeCircleView(over: Partial<Circle> = {}): Circle {
  return {
    id: testId<Circle["id"]>("c1"),
    ref: "trip-c1",
    name: "Trip",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    status: "active",
    currencyLocked: false,
    ...over,
  };
}

export function makeCategoryView(over: Partial<Category> = {}): Category {
  return {
    id: testId<Category["id"]>("cat-groceries"),
    name: "Groceries",
    type: "expense",
    color: "green",
    status: "active",
    creator: { displayName: "You", image: undefined },
    ...over,
  };
}

export function makeMemberView(over: Partial<Member> = {}): Member {
  return {
    id: testId<Member["id"]>("mem-you"),
    displayName: "You",
    image: undefined,
    role: "owner",
    status: "active",
    joinedAt: 0,
    isSelf: true,
    ...over,
  };
}

export function makeTransactionView(over: Partial<Transaction> = {}): Transaction {
  return {
    id: testId<Transaction["id"]>("t1"),
    ref: "weekly-shop-t1",
    type: "expense",
    title: "Weekly shop",
    note: undefined,
    amountMinorUnits: 1250,
    date: "2026-05-15",
    month: "2026-05",
    status: "active",
    recordedBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
    paidBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
    categories: [
      { id: testId<Category["id"]>("cat-groceries"), name: "Groceries", color: "green" },
    ],
    canEditFields: true,
    canArchive: true,
    ...over,
  };
}

/** A Transaction DETAIL view (TXN-4): the {@link makeTransactionView} shape plus an Audit
 * Metadata block. Defaults to a fixed-instant audit (UTC-rendered by the surface) so a
 * timestamp test reads deterministic values regardless of the runner's timezone. */
export function makeTransactionDetailView(
  over: Partial<TransactionDetail> = {},
): TransactionDetail {
  const me = { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined };
  return {
    ...makeTransactionView(),
    audit: {
      createdBy: me,
      createdAt: Date.UTC(2026, 4, 15, 9, 30),
      updatedBy: me,
      updatedAt: Date.UTC(2026, 4, 16, 14, 5),
    },
    ...over,
  };
}

/** One Transaction History event (TXN-4). Defaults to a `created` event with a frozen,
 * ID-free set of changes; pass overrides for the action, actor, instant, or changes. */
export function makeHistoryEventView(
  over: Partial<TransactionHistoryEvent> = {},
): TransactionHistoryEvent {
  return {
    id: testId<TransactionHistoryEvent["id"]>("h1"),
    action: "created",
    createdAt: Date.UTC(2026, 4, 15, 9, 30),
    actor: { displayName: "You", image: undefined },
    changes: [
      { field: "title", to: "Weekly shop" },
      { field: "amount", toMoney: { minorUnits: 1250, currency: "USD" } },
    ],
    ...over,
  };
}

/** Surfaces the live URL (pathname + search) so URL-state tests can assert it. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

/**
 * Renders arbitrary (non-Circle-scoped) ROUTES under a real `MemoryRouter` so route
 * navigation is exercised end to end: the test seeds the address bar via `initialEntries`,
 * reads it back through {@link LocationProbe} (`location()`), and real route logic,
 * `useNavigate`, and `useSnackbar` all run. Used by the shell surfaces that live ABOVE
 * the Circle guard (the Circle switcher, the Create Circle flow — CS-0), which resolve no
 * Circle from context. `SnackbarProvider` wraps so a route's snackbar has its real context.
 *
 * `routes` is the caller's `<Route>` subtree, kept generic so this helper never imports
 * route modules — the test wires only the routes it needs (typically the surface under
 * test plus a probe route the flow navigates to).
 */
export function renderRoutes(routes: ReactNode, opts: { initialEntries?: string[] } = {}) {
  const result = render(
    <SnackbarProvider>
      <MemoryRouter initialEntries={opts.initialEntries ?? ["/"]}>
        <LocationProbe />
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </SnackbarProvider>,
  );
  return {
    ...result,
    /** The current URL (pathname + search), e.g. `/circles/my-home-c1`. */
    location: () => result.getByTestId("location").textContent ?? "",
  };
}

/**
 * Renders Circle-scoped ROUTES under a real `MemoryRouter` so URL-owned state (the
 * ledger `month`, the `new` create param, and the edit object route — TXN-5/ADR 0017)
 * is exercised end to end: the test seeds the address bar via `initialEntries`, reads
 * it back through {@link LocationProbe} (`location()`), and the real route logic,
 * `useSearchParams`, `useResolvedTransaction`, and `useSnackbar` all run. The Circle is
 * supplied through the same Outlet context channel the Circle guard uses, so the real
 * `useCircle` runs; `rerender(nextCircle)` models the reactive `getCircle` flipping
 * (e.g. archived mid-edit). `SnackbarProvider` wraps so the unavailable-link fallback
 * has its real context.
 *
 * `routes` is the caller's `<Route>` subtree (the routes under test), kept generic so
 * this helper never imports route modules — the test wires only the routes it needs.
 * `chrome` is an optional always-mounted node rendered inside the Router but outside
 * `Routes` (so it has router context and survives route changes) — e.g. a nav control a
 * test uses to drive an in-route param change (edit→edit) without unmounting the route.
 */
export function renderCircleRoutes(
  circle: Circle,
  routes: ReactNode,
  opts: { initialEntries?: string[]; chrome?: ReactNode } = {},
) {
  const wrap = (current: Circle) => (
    <SnackbarProvider>
      <MemoryRouter initialEntries={opts.initialEntries ?? ["/"]}>
        <LocationProbe />
        {opts.chrome}
        <Routes>
          <Route element={<Outlet context={{ circle: current } satisfies CircleOutletContext} />}>
            {routes}
          </Route>
        </Routes>
      </MemoryRouter>
    </SnackbarProvider>
  );
  const result = render(wrap(circle));
  return {
    ...result,
    rerender: (nextCircle: Circle = circle) => result.rerender(wrap(nextCircle)),
    /** The current URL (pathname + search), e.g. `/circles/trip-c1/transactions?month=2026-05`. */
    location: () => result.getByTestId("location").textContent ?? "",
  };
}

/**
 * Mints a synthetic branded Convex Id for fixtures. The brand (`Id<"...">`) is a
 * nominal string with no runtime constructor, and jsdom tests have no backend to
 * issue real ones — so this single, documented assertion is the one sanctioned
 * cast; every call site stays cast-free. The return type is inferred as `Brand`.
 *
 * The `as` below is intentional and fine: Convex ids are compile-time-only brands
 * on `string`, so there is no type-safe minting path; centralizing it here matches
 * AGENTS.md (avoid scattered casts, one documented boundary).
 */
export const testId = <Brand extends string>(value: string) => value as Brand;
