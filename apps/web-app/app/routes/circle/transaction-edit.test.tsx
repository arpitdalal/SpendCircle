import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Circle, Transaction } from "~/lib/data.js";
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

// The validated `returnTo` origin an editor is opened with (issue #123): a filtered ledger.
// Close / save / bad-link fallback / archived redirect all land back here.
const LEDGER_ORIGIN = `/circles/${REF}/transactions?month=2026-05`;
const LEDGER = encodeURIComponent(LEDGER_ORIGIN);

const ROUTES = (
  <>
    {/* The fallback / return targets; placeholders are enough to assert the URL landed.
        The detail route is the `from=detail` return target (TXN-4). */}
    <Route path="circles/:circleRef/transactions" element={<div>ledger</div>} />
    <Route path="circles/:circleRef/transactions/:transactionRef" element={<div>detail</div>} />
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
  const url = opts.url ?? `/circles/${REF}/transactions/weekly-shop-t1/edit?returnTo=${LEDGER}`;
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

  it("canonicalizes a stale title slug in place, preserving the returnTo query", async () => {
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/stale-slug-t1/edit?returnTo=${LEDGER}`,
    });
    await waitFor(() =>
      expect(location()).toBe(
        `/circles/${REF}/transactions/weekly-shop-t1/edit?returnTo=${LEDGER}`,
      ),
    );
  });
});

describe("TransactionEdit — unavailable target (anti-enumeration)", () => {
  it("falls back to the returnTo origin and shows the generic snackbar", async () => {
    const { location } = setup({ editableTransaction: null });
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
  });

  it("falls back to the bare ledger when the edit URL has no returnTo", async () => {
    const { location } = setup({
      editableTransaction: null,
      url: `/circles/${REF}/transactions/weekly-shop-t1/edit`,
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions`));
  });

  it("falls back to the bare ledger for a tampered (protocol-relative) returnTo — no open redirect", async () => {
    const { location } = setup({
      editableTransaction: null,
      url: `/circles/${REF}/transactions/weekly-shop-t1/edit?returnTo=${encodeURIComponent("//evil.com")}`,
    });
    await waitFor(() => expect(location()).toBe(`/circles/${REF}/transactions`));
  });

  it("still takes the bad-link path for a malformed ref on a WRITABLE circle", async () => {
    // The disabled-circle suppression must not leak to the normal case: on a writable
    // Circle a malformed edit ref is an app-emitted bad link — generic snackbar + report.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { location } = setup({
      url: `/circles/${REF}/transactions/not-valid!/edit?returnTo=${LEDGER}`,
    });
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
    expect(screen.getByText("That link isn't available.")).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("TransactionEdit — return navigation", () => {
  it("returns to the returnTo origin on cancel, even when the transaction is off that month", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      // The edited Transaction is in September, but the editor was opened from the May
      // ledger — closing must return to that origin, not the Transaction's own month.
      editableTransaction: makeTransactionView({
        ref: "weekly-shop-t1",
        title: "Weekly shop",
        date: "2026-09-15",
        month: "2026-09",
      }),
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(LEDGER_ORIGIN);
  });

  it("returns to the returnTo origin after a successful save", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalled());
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
  });
});

describe("TransactionEdit — return to the detail page (returnTo = detail URL)", () => {
  // The detail page's Edit link sets returnTo to the detail's own URL (which itself still
  // carries a returnTo to the ledger), so edit → close lands back on detail.
  const DETAIL_RETURN = `/circles/${REF}/transactions/weekly-shop-t1?returnTo=${LEDGER}`;
  const detailEditUrl = `/circles/${REF}/transactions/weekly-shop-t1/edit?returnTo=${encodeURIComponent(DETAIL_RETURN)}`;

  it("returns to the transaction detail on cancel when opened from there", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: detailEditUrl,
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(DETAIL_RETURN);
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("returns to the transaction detail after a successful save when opened from there", async () => {
    const user = userEvent.setup();
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: detailEditUrl,
    });
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateTransaction).toHaveBeenCalled());
    await waitFor(() => expect(location()).toBe(DETAIL_RETURN));
  });

  it("returns to the BARE detail when opened from a detail that had no origin of its own", async () => {
    const user = userEvent.setup();
    const bareDetail = `/circles/${REF}/transactions/weekly-shop-t1`;
    const { location } = setup({
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: `/circles/${REF}/transactions/weekly-shop-t1/edit?returnTo=${encodeURIComponent(bareDetail)}`,
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(location()).toBe(bareDetail);
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("returns to the detail read surface on an archived Circle when opened from there", async () => {
    // Archived ≠ inaccessible: the detail is a read surface that still opens, so a
    // detail-origin edit link on a read-only Circle lands back on detail, not the ledger.
    const { location } = setup({
      circle: { status: "archived" },
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
      url: detailEditUrl,
    });
    await waitFor(() => expect(location()).toBe(DETAIL_RETURN));
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
    expect(screen.queryByText("That link isn't available.")).not.toBeInTheDocument();
  });
});

describe("TransactionEdit — archived Circle stays read-only in place", () => {
  it("redirects an edit link to the returnTo origin without ejecting through unavailable", async () => {
    const { location } = setup({
      circle: { status: "archived" },
      // Even with a resolvable target, an archived Circle is read-only: no edit form.
      editableTransaction: makeTransactionView({ ref: "weekly-shop-t1", title: "Weekly shop" }),
    });
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
    // Read-only redirect, not the unavailable-link path — no snackbar.
    expect(screen.queryByText("That link isn't available.")).not.toBeInTheDocument();
  });

  it("redirects without the unavailable snackbar even when the target resolves to null", async () => {
    // An archived Circle must drop ANY edit URL to the returnTo origin — including one
    // whose target is unavailable. The resolver is disabled while read-only, so the
    // generic unavailable-link path can never fire and race the redirect.
    const { location } = setup({ circle: { status: "archived" }, editableTransaction: null });
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
    expect(screen.queryByText("That link isn't available.")).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /edit transaction/i })).not.toBeInTheDocument();
  });

  it("redirects a MALFORMED edit ref silently — no unavailable snackbar, no app-error report", async () => {
    // An unparseable ref is normally an app-emitted bad link (reported + snackbar). But a
    // read-only Circle disables resolution entirely, so even a malformed edit URL drops
    // to the returnTo origin with no snackbar and no spurious app-error report.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { location } = setup({
      circle: { status: "archived" },
      editableTransaction: null,
      url: `/circles/${REF}/transactions/not-valid!/edit?returnTo=${LEDGER}`,
    });
    await waitFor(() => expect(location()).toBe(LEDGER_ORIGIN));
    expect(screen.queryByText("That link isn't available.")).not.toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("TransactionEdit — target change without a loading gap", () => {
  /** A nav control rendered as always-mounted chrome so clicking it changes the edit
   * param WITHOUT unmounting the route — the Back/Forward-to-cached-target case. */
  function GoTo({ to }: { to: string }) {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate(to)}>
        go
      </button>
    );
  }

  it("remounts the form so a navigated-to target never carries the previous one's state", async () => {
    const user = userEvent.setup();
    // Alpha is an Expense, Beta an Income. The type segment is plain component state
    // seeded from the Transaction at MOUNT (not a re-syncable form default), so it is
    // the state that genuinely sticks if the form is reused — a reused Expense form
    // would still mark "Expense" pressed for an Income target, the wrong type to save.
    const alpha = makeTransactionView({
      id: testId<Transaction["id"]>("t1"),
      ref: "alpha-t1",
      title: "Alpha",
      type: "expense",
    });
    const beta = makeTransactionView({
      id: testId<Transaction["id"]>("t2"),
      ref: "beta-t2",
      title: "Beta",
      type: "income",
      categories: [
        {
          id: testId<Transaction["categories"][number]["id"]>("cat-pay"),
          name: "Pay",
          color: "teal",
        },
      ],
    });
    configureConvex({
      categories: [
        makeCategoryView(),
        makeCategoryView({
          id: testId<ReturnType<typeof makeCategoryView>["id"]>("cat-pay"),
          name: "Pay",
          type: "income",
        }),
      ],
      members: [makeMemberView()],
      // Both targets resolve synchronously (cached) — no pending Splash gap to remount
      // the form for us, so the id-keying is what must do it.
      editableTransaction: (args) => (args.transactionId === "t2" ? beta : alpha),
      updateTransaction,
    });
    renderCircleRoutes(makeCircleView(), ROUTES, {
      initialEntries: [`/circles/${REF}/transactions/alpha-t1/edit?returnTo=${LEDGER}`],
      chrome: <GoTo to={`/circles/${REF}/transactions/beta-t2/edit?returnTo=${LEDGER}`} />,
    });

    const form = () => screen.getByRole("form", { name: /edit transaction/i });
    expect(within(form()).getByLabelText("Title")).toHaveValue("Alpha");
    expect(
      within(form()).getByRole("button", { name: "Expense", pressed: true }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "go" }));
    // Without id-keying the reused Expense form would still mark "Expense" pressed for
    // the Income target; remounting reflects Beta's income type and title.
    await waitFor(() => expect(within(form()).getByLabelText("Title")).toHaveValue("Beta"));
    expect(
      within(form()).getByRole("button", { name: "Income", pressed: true }),
    ).toBeInTheDocument();
  });
});
