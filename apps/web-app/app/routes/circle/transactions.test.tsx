import { addMonths, currentMonth, toPlainDate } from "@spend-circle/domain";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const updateTransaction = vi.fn();
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
    recordedBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
    paidBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
    categories: [
      { id: testId<Category["id"]>("cat-groceries"), name: "Groceries", color: "green" },
    ],
    canEditFields: true,
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
    monthlySummary?: MonthlySummary | null;
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
  updateTransaction.mockReset();
  updateTransaction.mockResolvedValue("t1");
  configureConvex({
    // Default to a self Member / one active Category so the form is usable unless a
    // test overrides; loading/empty/null are opt-in by passing them explicitly.
    categories: opts.categories === undefined ? [makeCategory()] : opts.categories,
    members: opts.members === undefined ? [makeMember()] : opts.members,
    transactions: opts.transactions,
    transactionsStatus: opts.status,
    ...(opts.monthlySummary === undefined ? {} : { monthlySummary: opts.monthlySummary }),
    loadMore: paginatedLoadMore,
    createTransaction,
    updateTransaction,
  });
  return { ...renderInCircle(circle, <CircleTransactions />), circle };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleTransactions", () => {
  it("shows a month-named empty state when the month has no transactions", () => {
    setup({ transactions: [] });
    expect(screen.getByText(/No transactions in/)).toBeInTheDocument();
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

  it("blocks creating when the selected Paid By member is removed mid-form", async () => {
    const user = userEvent.setup();
    // A mutable members list the query double reads by reference, so removing a Member
    // in place models the reactive `listMembers` dropping them while the form is open.
    const members: Member[] = [
      makeMember(),
      makeMember({ id: testId<Member["id"]>("mem-y"), displayName: "Yuki", isSelf: false }),
    ];
    const { rerenderInCircle } = setup({
      categories: [makeCategory({ name: "Groceries", type: "expense" })],
      members,
    });

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    await user.type(within(form).getByLabelText("Title"), "Dinner");
    await user.type(within(form).getByLabelText(/Amount/), "20");
    await user.click(within(form).getByRole("button", { name: "Groceries" }));
    await user.selectOptions(within(form).getByLabelText("Paid by"), "mem-y");

    // Another Member removes Yuki from the circle while the form is open.
    members.splice(1, 1);
    rerenderInCircle(<CircleTransactions />);

    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    // The stale pick is surfaced, never silently dropped to self, and nothing is created.
    expect(await within(form).findByText(/no longer a member/i)).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
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

describe("CircleTransactions — Monthly Ledger (RPT-1)", () => {
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
    expect(within(totals).getByText("$5,000.00")).toBeInTheDocument(); // income
    expect(within(totals).getByText("$87.50")).toBeInTheDocument(); // expense
    expect(within(totals).getByText("$4,912.50")).toBeInTheDocument(); // net
  });

  it("shows a negative net when expenses exceed income", () => {
    setup({ monthlySummary: summaryOf(2_000, 9_000, -7_000) });
    const totals = screen.getByRole("group", { name: "Monthly totals" });
    expect(within(totals).getByText("-$70.00")).toBeInTheDocument();
  });

  it("defaults to the current month", () => {
    setup();
    expect(screen.getByLabelText("Month")).toHaveValue(currentMonth(new Date()));
  });

  it("steps to the previous and next month via the navigator (year-boundary safe)", async () => {
    const user = userEvent.setup();
    setup();
    const monthInput = screen.getByLabelText("Month");
    const now = currentMonth(new Date());

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(monthInput).toHaveValue(addMonths(now, -1));

    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(monthInput).toHaveValue(addMonths(now, 1));
  });

  it("jumps to a chosen month and names it in the empty state", () => {
    setup({ transactions: [] });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-03" } });
    expect(screen.getByLabelText("Month")).toHaveValue("2026-03");
    expect(screen.getByText("No transactions in March 2026.")).toBeInTheDocument();
  });

  it("never commits a non-valid month to the ledger", () => {
    setup({ transactions: [] });
    const monthInput = screen.getByLabelText("Month");
    const now = currentMonth(new Date());
    expect(monthInput).toHaveValue(now);

    // The handler only commits a value `isValidPlainMonth` accepts, so a bad month never
    // reaches the ledger queries (they throw `Invalid month`). jsdom — like a real
    // month-picker — sanitizes an out-of-range `type="month"` value to "", so what's
    // observable here is that the guard refuses to commit it and the month stays put;
    // the predicate itself (rejecting "2026-13" etc.) is covered in the domain tests.
    fireEvent.change(monthInput, { target: { value: "2026-13" } });
    expect(monthInput).toHaveValue(now);
  });

  it("defaults a create's date into the selected (non-current) month", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });

    // Navigate off the current month, then open a create — its date anchors to the
    // selected month so the new Transaction lands in the visible ledger, not silently
    // in today's month.
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-03" } });
    await user.click(screen.getByRole("button", { name: "Add expense" }));
    const form = screen.getByRole("form", { name: /add expense/i });
    expect(within(form).getByLabelText("Date")).toHaveValue("2026-03-01");

    await user.type(within(form).getByLabelText("Title"), "Back-dated");
    await user.type(within(form).getByLabelText(/Amount/), "10");
    await user.click(within(form).getByRole("button", { name: "Groceries" }));
    await user.click(within(form).getByRole("button", { name: "Add expense" }));

    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-03-01" }));
  });
});

describe("CircleTransactions — edit (TXN-2)", () => {
  it("shows an Edit affordance only on the viewer's own transactions", () => {
    setup({
      transactions: [
        makeTransaction({
          id: testId<Transaction["id"]>("mine"),
          title: "Mine",
          canEditFields: true,
        }),
        makeTransaction({
          id: testId<Transaction["id"]>("theirs"),
          title: "Theirs",
          canEditFields: false,
        }),
      ],
    });
    expect(screen.getByRole("button", { name: "Edit Mine" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Theirs" })).not.toBeInTheDocument();
  });

  it("hides the Edit affordance in an archived circle even for own transactions", () => {
    setup({
      circle: { status: "archived" },
      transactions: [makeTransaction({ title: "Mine", canEditFields: true })],
    });
    expect(screen.queryByRole("button", { name: "Edit Mine" })).not.toBeInTheDocument();
  });

  it("opens a prefilled edit form from a row", async () => {
    const user = userEvent.setup();
    setup({
      transactions: [
        makeTransaction({ title: "Weekly shop", amountMinorUnits: 1250, date: "2026-05-15" }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));

    const form = screen.getByRole("form", { name: /edit transaction/i });
    expect(within(form).getByLabelText("Title")).toHaveValue("Weekly shop");
    expect(within(form).getByLabelText(/Amount/)).toHaveValue("12.50"); // minor units → major
    expect(within(form).getByLabelText("Date")).toHaveValue("2026-05-15");
    // The attached Category is pre-selected.
    expect(
      within(form).getByRole("button", { name: "Groceries", pressed: true }),
    ).toBeInTheDocument();
  });

  it("saves edited fields through updateTransaction", async () => {
    const user = userEvent.setup();
    setup({ transactions: [makeTransaction({ title: "Weekly shop", amountMinorUnits: 1250 })] });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Big shop");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(updateTransaction).toHaveBeenCalledWith({
      transactionId: "t1",
      type: "expense",
      title: "Big shop",
      note: "",
      amountMinorUnits: 1250,
      date: "2026-05-15",
      categoryIds: ["cat-groceries"],
      paidByMemberId: "mem-you",
    });
  });

  it("confirms a type change, clears categories, and saves the new type + categories", async () => {
    const user = userEvent.setup();
    setup({
      transactions: [makeTransaction({ title: "Weekly shop" })],
      categories: [
        makeCategory({ name: "Groceries", type: "expense" }),
        makeCategory({ id: testId<Category["id"]>("cat-salary"), name: "Salary", type: "income" }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });

    // Switching the segment opens a confirmation; cancelling leaves the type alone.
    await user.click(within(form).getByRole("button", { name: "Income" }));
    const dialog = within(form).getByRole("alertdialog");
    expect(dialog).toHaveTextContent(/change to income/i);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(form).queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      within(form).getByRole("button", { name: "Expense", pressed: true }),
    ).toBeInTheDocument();

    // Confirming applies the Type Change: Expense categories clear, Income ones appear.
    await user.click(within(form).getByRole("button", { name: "Income" }));
    await user.click(
      within(within(form).getByRole("alertdialog")).getByRole("button", { name: "Change type" }),
    );
    expect(within(form).queryByRole("button", { name: "Groceries" })).not.toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Income", pressed: true })).toBeInTheDocument();

    // Must re-pick from the new type before saving.
    await user.click(within(form).getByRole("button", { name: "Salary" }));
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: "t1",
        type: "income",
        categoryIds: ["cat-salary"],
      }),
    );
  });

  it("blocks saving until the cleared categories are re-picked after a type change", async () => {
    const user = userEvent.setup();
    setup({
      transactions: [makeTransaction({ title: "Weekly shop" })],
      categories: [
        makeCategory({ name: "Groceries", type: "expense" }),
        makeCategory({ id: testId<Category["id"]>("cat-salary"), name: "Salary", type: "income" }),
      ],
    });
    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.click(within(form).getByRole("button", { name: "Income" }));
    await user.click(
      within(within(form).getByRole("alertdialog")).getByRole("button", { name: "Change type" }),
    );
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await within(form).findByText("Pick at least one category")).toBeInTheDocument();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("keeps an already-attached archived category on save without blocking", async () => {
    const user = userEvent.setup();
    setup({
      transactions: [
        makeTransaction({
          title: "Weekly shop",
          categories: [{ id: testId<Category["id"]>("cat-arch"), name: "OldCat", color: "green" }],
        }),
      ],
      categories: [
        makeCategory({
          id: testId<Category["id"]>("cat-arch"),
          name: "OldCat",
          status: "archived",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    // Shown as kept-archived (no removal ✕), and no blocking alert.
    expect(within(form).getByRole("button", { name: /OldCat · archived/ })).toBeInTheDocument();
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();

    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: ["cat-arch"], title: "Edited" }),
    );
  });

  it("blocks newly adding a category that was archived mid-edit", async () => {
    const user = userEvent.setup();
    const cats: Category[] = [
      makeCategory({ name: "Groceries", type: "expense" }),
      makeCategory({ id: testId<Category["id"]>("cat-snacks"), name: "Snacks", type: "expense" }),
    ];
    const { rerenderInCircle } = setup({
      transactions: [makeTransaction({ title: "Weekly shop" })],
      categories: cats,
    });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.click(within(form).getByRole("button", { name: "Snacks" })); // newly select an active one

    // Another Member archives "Snacks" while the form is open.
    cats[1] = makeCategory({
      id: testId<Category["id"]>("cat-snacks"),
      name: "Snacks",
      type: "expense",
      status: "archived",
    });
    rerenderInCircle(<CircleTransactions />);

    expect(within(form).getByText(/Snacks · archived ✕/)).toBeInTheDocument();
    expect(within(form).getByRole("alert")).toHaveTextContent(/"Snacks" was archived/);
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("shows a Removed Member's existing Paid By as a selectable option", async () => {
    const user = userEvent.setup();
    setup({
      transactions: [
        makeTransaction({
          title: "Weekly shop",
          paidBy: { id: testId<Member["id"]>("mem-rex"), displayName: "Rex", image: undefined },
        }),
      ],
      members: [makeMember()], // Rex is no longer a current Member
    });
    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    expect(within(form).getByRole("option", { name: "Rex (removed)" })).toBeInTheDocument();
  });

  it("blocks saving when a newly selected Paid By member is removed mid-edit", async () => {
    const user = userEvent.setup();
    // Mutable members list (read by reference by the query double); removing Yuki in
    // place models the reactive `listMembers` dropping them mid-edit.
    const members: Member[] = [
      makeMember(), // self, the Transaction's current Paid By
      makeMember({ id: testId<Member["id"]>("mem-y"), displayName: "Yuki", isSelf: false }),
    ];
    const { rerenderInCircle } = setup({
      transactions: [makeTransaction({ title: "Weekly shop" })],
      members,
    });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.selectOptions(within(form).getByLabelText("Paid by"), "mem-y");

    // Yuki is removed from the circle before Save.
    members.splice(1, 1);
    rerenderInCircle(<CircleTransactions />);

    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    // Surfaced, not silently left unchanged — and nothing is saved (server stays the
    // authority; this is the courtesy block, mirroring the archived-category guard).
    expect(await within(form).findByText(/no longer a member/i)).toBeInTheDocument();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("still saves a no-op when keeping a now-removed current Paid By", async () => {
    const user = userEvent.setup();
    // The Transaction's Paid By is Rex, who is no longer a current Member. Keeping him
    // (the unchanged value) must remain an allowed no-op, not a blocked stale pick.
    setup({
      transactions: [
        makeTransaction({
          title: "Weekly shop",
          paidBy: { id: testId<Member["id"]>("mem-rex"), displayName: "Rex", image: undefined },
        }),
      ],
      members: [makeMember()],
    });

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    // No block: keeping the removed Paid By sends it unchanged; the server no-ops it.
    expect(within(form).queryByText(/no longer a member/i)).not.toBeInTheDocument();
    expect(updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Edited", paidByMemberId: "mem-rex" }),
    );
  });

  it("surfaces a generic error and reports the failure when the edit fails", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setup({ transactions: [makeTransaction({ title: "Weekly shop" })] });
    updateTransaction.mockRejectedValueOnce(new Error("Network down"));

    await user.click(screen.getByRole("button", { name: "Edit Weekly shop" }));
    const form = screen.getByRole("form", { name: /edit transaction/i });
    await user.clear(within(form).getByLabelText("Title"));
    await user.type(within(form).getByLabelText("Title"), "Edited");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't save the transaction/i);
    expect(alert).not.toHaveTextContent(/Network down/);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
