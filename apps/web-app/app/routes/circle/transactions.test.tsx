import { toPlainDate } from "@spend-circle/domain";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Category,
  type Circle,
  type Member,
  type PaginationStatus,
  TRANSACTIONS_PAGE_SIZE,
  type Transaction,
} from "~/lib/data.js";
import { configureConvex, renderInCircle, testId } from "~/test/convex-react.js";

/**
 * Behavior test for the Transactions surface (jsdom). The ONLY thing doubled is
 * Convex's reactive client (`convex/react`, via the shared helper). The real
 * `~/lib/data.js` hooks, the real `useCircle` Outlet-context seam, and the real
 * route + form logic run, so a drift between the route, the data layer, and the
 * backend query contract is caught here rather than mocked away (ADR 0006).
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleTransactions from "./transactions.js";

const createTransaction = vi.fn();
const paginatedLoadMore = vi.fn();

function makeCategory(over: Partial<Category> = {}): Category {
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

function makeTransaction(over: Partial<Transaction> = {}): Transaction {
  return {
    id: testId<Transaction["id"]>("t1"),
    type: "expense",
    title: "Weekly shop",
    note: undefined,
    amountMinorUnits: 1250,
    date: "2026-05-15",
    month: "2026-05",
    status: "active",
    recordedBy: { displayName: "You", image: undefined },
    paidBy: { displayName: "You", image: undefined },
    categories: [
      { id: testId<Category["id"]>("cat-groceries"), name: "Groceries", color: "green" },
    ],
    ...over,
  };
}

function makeMember(over: Partial<Member> = {}): Member {
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

function setup(
  opts: {
    circle?: Partial<Circle>;
    transactions?: Transaction[];
    status?: PaginationStatus;
    categories?: Category[] | null;
    members?: Member[] | null;
  } = {},
) {
  const circle: Circle = {
    id: testId<Circle["id"]>("c1"),
    ref: "trip-c1",
    name: "Trip",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    status: "active",
    currencyLocked: false,
    ...opts.circle,
  };
  createTransaction.mockReset();
  createTransaction.mockResolvedValue("new-id");
  configureConvex({
    // Default to a self Member / one active Category so the form is usable unless a
    // test overrides; loading/empty/null are opt-in by passing them explicitly.
    categories: opts.categories === undefined ? [makeCategory()] : opts.categories,
    members: opts.members === undefined ? [makeMember()] : opts.members,
    transactions: opts.transactions,
    transactionsStatus: opts.status,
    loadMore: paginatedLoadMore,
    createTransaction,
  });
  return { ...renderInCircle(circle, <CircleTransactions />), circle };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleTransactions", () => {
  it("shows an empty state when there are no transactions", () => {
    setup({ transactions: [] });
    expect(screen.getByText(/No transactions yet/)).toBeInTheDocument();
  });

  it("shows a loading state while the first page resolves", () => {
    setup({ transactions: [], status: "LoadingFirstPage" });
    expect(screen.getByText(/Loading transactions/)).toBeInTheDocument();
  });

  it("renders a Load more control and pages the source by the page size", async () => {
    const user = userEvent.setup();
    setup({ transactions: [makeTransaction()], status: "CanLoadMore" });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    // The real `useTransactions` translates the click into a paged source read.
    expect(paginatedLoadMore).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE);
  });

  it("disables Load more while the next page is loading", () => {
    setup({ transactions: [makeTransaction()], status: "LoadingMore" });
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
  });

  it("lists transactions with formatted money and the income sign", () => {
    const txn = makeTransaction({
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

  it("opens the Expense form scoped to expense from the Add expense CTA", async () => {
    const user = userEvent.setup();
    setup({
      categories: [
        makeCategory({ name: "Groceries", type: "expense" }),
        makeCategory({ id: testId<Category["id"]>("i1"), name: "Salary", type: "income" }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    const form = screen.getByRole("form", { name: /add expense/i });
    // Type-scoped categories: the expense form shows expense categories only.
    expect(within(form).getByRole("button", { name: "Groceries" })).toBeInTheDocument();
    expect(within(form).queryByRole("button", { name: "Salary" })).not.toBeInTheDocument();
  });

  it("submits a new expense with parsed minor units and the default Paid By", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Weekly shop");
    await user.type(within(form).getByLabelText(/Amount/), "12.5");
    await user.click(within(form).getByRole("button", { name: "Groceries" }));
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    // The "Me" Paid By default omits paidByMemberId so the server uses the creator;
    // the date defaults to today.
    expect(createTransaction).toHaveBeenCalledWith({
      circleId: "c1",
      type: "expense",
      title: "Weekly shop",
      note: undefined,
      amountMinorUnits: 1250,
      date: toPlainDate(new Date()),
      categoryIds: ["cat-groceries"],
      paidByMemberId: undefined, // "Me" default omits → server defaults to creator
    });
  });

  it("sends the selected Paid By Member id when changed away from Me", async () => {
    const user = userEvent.setup();
    setup({
      categories: [makeCategory({ name: "Groceries", type: "expense" })],
      members: [
        makeMember(),
        makeMember({ id: testId<Member["id"]>("mem-alex"), displayName: "Alex", isSelf: false }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Dinner");
    await user.type(within(form).getByLabelText(/Amount/), "20");
    await user.click(within(form).getByRole("button", { name: "Groceries" }));
    await user.selectOptions(within(form).getByLabelText("Paid by"), "mem-alex");
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ paidByMemberId: "mem-alex" }),
    );
  });

  it("reveals required errors on submit and does not create when fields are empty", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    // Submit is not gated on presence (no real users' time wasted guessing why it's
    // greyed out): the user can attempt it and is told exactly what's missing.
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    expect(await within(form).findByText("Title is required")).toBeInTheDocument();
    expect(within(form).getByText("Amount is required")).toBeInTheDocument();
    expect(within(form).getByText("Pick at least one category")).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("shows a field error on blur once a field is edited and invalid", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText(/Amount/), "0");
    await user.tab(); // blur the amount field

    expect(await within(form).findByText("Amount must be greater than zero")).toBeInTheDocument();
  });

  it("stays quiet when a required field is focused and blurred without typing", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    const form = screen.getByRole("form", { name: /add expense/i });
    await user.click(within(form).getByLabelText("Title"));
    await user.tab(); // blur without typing — an untouched field must not nag

    expect(within(form).queryByText("Title is required")).not.toBeInTheDocument();
  });

  it("keeps a category archived mid-edit visible and blocks submit (PRD 57)", async () => {
    const user = userEvent.setup();
    // The query double reads this array by reference each render, so mutating it in
    // place simulates the reactive `listCategories` flipping the Category to archived
    // mid-edit (the route requested `includeArchived`, so it still comes back).
    const cats: Category[] = [
      makeCategory({ id: testId<Category["id"]>("cat-x"), name: "Snacks", type: "expense" }),
    ];
    const { rerenderInCircle } = setup({ categories: cats });

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Movie night");
    await user.type(within(form).getByLabelText(/Amount/), "10");
    await user.click(within(form).getByRole("button", { name: "Snacks" })); // select while active

    // Another Member archives "Snacks" while the form is open.
    cats[0] = makeCategory({
      id: testId<Category["id"]>("cat-x"),
      name: "Snacks",
      type: "expense",
      status: "archived",
    });
    rerenderInCircle(<CircleTransactions />);

    // It stays visible (badged archived), is not silently dropped, and explains itself.
    expect(within(form).getByText(/Snacks · archived/)).toBeInTheDocument();
    expect(within(form).getByRole("alert")).toHaveTextContent(/"Snacks" was archived/);

    // Submitting is blocked while the archived Category is still selected.
    await user.click(within(form).getByRole("button", { name: "Add expense" }));
    expect(createTransaction).not.toHaveBeenCalled();

    // Removing it clears the block.
    await user.click(within(form).getByText(/Snacks · archived/));
    expect(within(form).queryByText(/Snacks · archived/)).not.toBeInTheDocument();
  });

  it("surfaces a generic error and reports the failure when the create fails", async () => {
    const user = userEvent.setup();
    // The unexpected failure is reported (Sentry once it lands), never swallowed.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });
    createTransaction.mockRejectedValueOnce(new Error("Network down"));

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Weekly shop");
    await user.type(within(form).getByLabelText(/Amount/), "10");
    await user.click(within(form).getByRole("button", { name: "Groceries" }));
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't save the transaction/i);
    expect(alert).not.toHaveTextContent(/Network down/);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("prompts to create a category first when none exist for the type", async () => {
    const user = userEvent.setup();
    setup({ categories: [] });
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.getByText(/No expense categories yet/)).toBeInTheDocument();
  });

  it("hides the CTAs and shows a read-only notice for an archived Circle", () => {
    setup({ circle: { status: "archived" }, transactions: [] });
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
  });

  it("closes an open form in place when the Circle is archived mid-edit", async () => {
    const user = userEvent.setup();
    const { rerenderInCircle, circle } = setup({
      categories: [makeCategory({ name: "Groceries", type: "expense" })],
    });

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.getByRole("form", { name: /add expense/i })).toBeInTheDocument();

    // The Owner archives the Circle while the form is open; the reactive getCircle
    // flips status and the guard layout re-provides it through Outlet context. The
    // Member keeps access (archived ≠ inaccessible) so we stay on the route, not eject.
    rerenderInCircle(<CircleTransactions />, { ...circle, status: "archived" });

    // The write surface collapses live: form gone, CTAs gone, the read-only banner
    // explains it in place — no snackbar, no redirect.
    expect(screen.queryByRole("form", { name: /add expense/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).not.toBeInTheDocument();
    expect(screen.getByText(/circle is archived/i)).toBeInTheDocument();
  });
});
