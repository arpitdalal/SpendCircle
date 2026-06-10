import { screen, waitFor } from "@testing-library/react";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Circle, Member, TransactionDetail, TransactionHistoryEvent } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeHistoryEventView,
  makeTransactionDetailView,
  renderCircleRoutes,
  testId,
} from "~/test/convex-react.js";

const memberId = (slug: string) => testId<Member["id"]>(slug);

/**
 * Behavior test for the Transaction DETAIL object route (jsdom, TXN-4/ADR 0016/0017) — the
 * reference object route. Doubles ONLY Convex's reactive client and runs the REAL route +
 * the REAL `useResolvedTransactionDetail` adapter + the REAL `useResolvedRef` state machine
 * + the REAL `useTransactionHistory` hook under a REAL router, so the detail deep link's
 * resolution (fetch-by-id, stale-slug canonicalization, unavailable fallback) and the
 * rendered Audit Metadata + Transaction History are exercised exactly as in the app.
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import TransactionDetailRoute from "./transaction-detail.js";

const REF = "trip-c1";

const ROUTES = (
  <>
    {/* The fallback / return target; a placeholder is enough to assert the URL landed. */}
    <Route path="circles/:circleRef/transactions" element={<div>ledger</div>} />
    <Route
      path="circles/:circleRef/transactions/:transactionRef"
      element={<TransactionDetailRoute />}
    />
  </>
);

function setup(
  opts: {
    circle?: Partial<Circle>;
    transactionDetail?: TransactionDetail | null | undefined;
    transactionHistory?: ReturnType<typeof makeHistoryEventView>[];
    url?: string;
  } = {},
) {
  const circle = makeCircleView(opts.circle);
  configureConvex({
    transactionDetail: opts.transactionDetail,
    transactionHistory: opts.transactionHistory ?? [],
  });
  const url = opts.url ?? `/circles/${REF}/transactions/weekly-shop-t1`;
  return renderCircleRoutes(circle, ROUTES, { initialEntries: [url] });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("TransactionDetail — resolution", () => {
  it("shows a splash while the detail target resolves", () => {
    setup({ transactionDetail: undefined }); // query still loading
    expect(screen.getByText("Opening transaction…")).toBeInTheDocument();
  });

  it("renders the detail when the target resolves", () => {
    setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    expect(screen.getByRole("heading", { name: "Weekly shop" })).toBeInTheDocument();
  });

  it("canonicalizes a stale title slug in place", async () => {
    const { location } = setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/stale-slug-t1`,
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions/weekly-shop-t1`));
  });

  it("falls back to the ledger and shows the generic snackbar for an unavailable target (anti-enumeration)", async () => {
    const { location } = setup({ transactionDetail: null });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions`));
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Weekly shop" })).not.toBeInTheDocument();
  });

  it("takes the bad-link path for a malformed ref (an app-emitted bad link)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { location } = setup({ url: `/circles/${REF}/transactions/not-valid!` });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions`));
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("TransactionDetail — fields & Audit Metadata (PRD 76)", () => {
  it("shows the Transaction fields and the created / last-updated audit, timestamps in UTC", () => {
    setup({
      transactionDetail: makeTransactionDetailView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        amountMinorUnits: 1250,
        date: "2026-05-15",
        paidBy: { id: memberId("mem-alex"), displayName: "Alex", image: undefined },
        recordedBy: { id: memberId("mem-you"), displayName: "Olive Owner", image: undefined },
        audit: {
          createdBy: { id: memberId("mem-you"), displayName: "Olive Owner", image: undefined },
          createdAt: Date.UTC(2026, 4, 15, 9, 30),
          updatedBy: { id: memberId("mem-alex"), displayName: "Alex", image: undefined },
          updatedAt: Date.UTC(2026, 4, 16, 14, 5),
        },
      }),
    });

    expect(screen.getByText("-$12.50")).toBeInTheDocument(); // expense, sign + amount
    expect(screen.getByText("2026-05-15")).toBeInTheDocument();

    const audit = screen.getByRole("region", { name: "Audit metadata" });
    expect(audit).toHaveTextContent("Created by");
    expect(audit).toHaveTextContent("Olive Owner");
    expect(audit).toHaveTextContent("Last updated by");
    expect(audit).toHaveTextContent("Alex"); // the last editor
    expect(audit).toHaveTextContent("May 15, 2026");
    expect(audit).toHaveTextContent("May 16, 2026");
    expect(audit).toHaveTextContent("UTC"); // never the viewer timezone
  });
});

describe("TransactionDetail — Transaction History (PRD 77)", () => {
  it("renders the Transaction History list fed by the paginated query", () => {
    setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      transactionHistory: [
        makeHistoryEventView({
          id: testId<TransactionHistoryEvent["id"]>("h2"),
          action: "edited",
          actor: { displayName: "Olive Owner", image: undefined },
          changes: [{ field: "title", from: "Weekly shop", to: "Renamed shop" }],
        }),
        makeHistoryEventView({
          id: testId<TransactionHistoryEvent["id"]>("h1"),
          action: "created",
          actor: { displayName: "Olive Owner", image: undefined },
          changes: [{ field: "title", to: "Weekly shop" }],
        }),
      ],
    });

    const history = screen.getByRole("region", { name: "History" });
    expect(history).toHaveTextContent("edited");
    expect(history).toHaveTextContent("Renamed shop");
    expect(history).toHaveTextContent("created");
  });

  it("shows the history empty state when the audit has no events yet", () => {
    setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      transactionHistory: [],
    });
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });
});

describe("TransactionDetail — ledger month preserved (Back / Edit links)", () => {
  it("returns Back to the same ledger month the row was opened from", () => {
    setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/weekly-shop-t1?month=2026-05&view=archived`,
    });
    expect(screen.getByRole("link", { name: /Back to transactions/ })).toHaveAttribute(
      "href",
      `/circles/${REF}/transactions?month=2026-05`,
    );
  });

  it("falls back to the bare ledger when the URL carries no valid slice", () => {
    setup({
      transactionDetail: makeTransactionDetailView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/weekly-shop-t1`,
    });
    expect(screen.getByRole("link", { name: /Back to transactions/ })).toHaveAttribute(
      "href",
      `/circles/${REF}/transactions`,
    );
  });
});

describe("TransactionDetail — edit affordance (courtesy nav, server enforces)", () => {
  it("offers an Edit link to the recorder, carrying the slice and from=detail so close returns here", () => {
    setup({
      transactionDetail: makeTransactionDetailView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        canEditFields: true,
      }),
      url: `/circles/${REF}/transactions/weekly-shop-t1?month=2026-05`,
    });
    expect(screen.getByRole("link", { name: "Edit Weekly shop" })).toHaveAttribute(
      "href",
      `/circles/${REF}/transactions/weekly-shop-t1/edit?month=2026-05&from=detail`,
    );
  });

  it("carries only from=detail (no month) when the detail itself was opened with no slice", () => {
    setup({
      transactionDetail: makeTransactionDetailView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        canEditFields: true,
      }),
      url: `/circles/${REF}/transactions/weekly-shop-t1`,
    });
    expect(screen.getByRole("link", { name: "Edit Weekly shop" })).toHaveAttribute(
      "href",
      `/circles/${REF}/transactions/weekly-shop-t1/edit?from=detail`,
    );
  });

  it("hides the Edit link from a non-recorder (canEditFields=false)", () => {
    setup({
      transactionDetail: makeTransactionDetailView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        canEditFields: false,
      }),
    });
    expect(screen.queryByRole("link", { name: "Edit Weekly shop" })).not.toBeInTheDocument();
  });

  it("hides the Edit link on an archived circle even from the recorder (read-only)", () => {
    setup({
      circle: { status: "archived" },
      transactionDetail: makeTransactionDetailView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        canEditFields: true,
      }),
    });
    expect(screen.queryByRole("link", { name: "Edit Weekly shop" })).not.toBeInTheDocument();
  });
});
