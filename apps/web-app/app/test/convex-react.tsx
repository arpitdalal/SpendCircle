import { api } from "@spend-circle/convex";
import { render } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import type { ReactElement } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { type Mock, vi } from "vitest";
import type { Category, Circle, Member, PaginationStatus, Transaction } from "~/lib/data.js";
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
  createTransaction: getFunctionName(api.transactions.createTransaction),
  createCategory: getFunctionName(api.categories.createCategory),
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
  /** `listTransactions` page (paginated). */
  transactions?: Transaction[];
  transactionsStatus?: PaginationStatus;
  /** The paginated `loadMore`; assert against it for "Load more" wiring. */
  loadMore?: () => void;
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
  createTransaction?: Mock;
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
    transactionsStatus = "Exhausted",
    loadMore = () => {},
    createTransaction,
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
        default:
          return undefined;
      }
    },
  );

  convexReactMock.usePaginatedQuery.mockImplementation((fn: FunctionReference<"query">) =>
    getFunctionName(fn) === NAME.listTransactions
      ? { results: transactions, status: transactionsStatus, loadMore }
      : { results: [], status: "Exhausted", loadMore: () => {} },
  );

  const noop = vi.fn();
  convexReactMock.useMutation.mockImplementation((fn: FunctionReference<"mutation">) => {
    switch (getFunctionName(fn)) {
      case NAME.createTransaction:
        return createTransaction ?? noop;
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
