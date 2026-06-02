import { toPlainDate } from "@spend-circle/domain";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, Circle, Member, Transaction } from "~/lib/data.js";

/**
 * Render smoke for the Transactions surface (jsdom, no backend). The data seam
 * (`useTransactions`/`useCategories`/`useMembers`/`useCreateTransaction`) and the
 * resolved Circle are mocked, so the route's behavior — the type-scoped CTAs, the
 * category multi-select, amount parsing, the Paid By default, and the create call
 * — is asserted without a live Convex client (ADR 0006).
 */
const {
  useTransactions,
  useCategories,
  useMembers,
  useCreateTransaction,
  createTransaction,
  useCircle,
} = vi.hoisted(() => ({
  useTransactions: vi.fn(),
  useCategories: vi.fn(),
  useMembers: vi.fn(),
  useCreateTransaction: vi.fn(),
  createTransaction: vi.fn(),
  useCircle: vi.fn(),
}));
vi.mock("~/lib/data.js", () => ({
  useTransactions,
  useCategories,
  useMembers,
  useCreateTransaction,
}));
vi.mock("~/routes/layouts/circle-layout.js", () => ({ useCircle }));

import CircleTransactions from "./transactions.js";

function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: "cat-groceries" as Category["id"],
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
    id: "t1" as Transaction["id"],
    type: "expense",
    title: "Weekly shop",
    note: undefined,
    amountMinorUnits: 1250,
    date: "2026-05-15",
    month: "2026-05",
    status: "active",
    recordedBy: { displayName: "You", image: undefined },
    paidBy: { displayName: "You", image: undefined },
    categories: [{ id: "cat-groceries" as Category["id"], name: "Groceries", color: "green" }],
    ...over,
  };
}

function makeMember(over: Partial<Member> = {}): Member {
  return {
    id: "mem-you" as Member["id"],
    displayName: "You",
    image: undefined,
    role: "owner",
    status: "active",
    joinedAt: 0,
    isSelf: true,
    ...over,
  };
}

type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

function setup(
  opts: {
    circle?: Partial<Circle>;
    transactions?: Transaction[];
    status?: PaginationStatus;
    loadMore?: () => void;
    categories?: Category[] | null | undefined;
    members?: Member[] | null | undefined;
  } = {},
) {
  const circle: Circle = {
    id: "c1" as Circle["id"],
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
  useCircle.mockReturnValue(circle);
  createTransaction.mockReset();
  createTransaction.mockResolvedValue("new-id");
  useCreateTransaction.mockReturnValue(createTransaction);
  useTransactions.mockReturnValue({
    transactions: opts.transactions ?? [],
    status: opts.status ?? "Exhausted",
    loadMore: opts.loadMore ?? vi.fn(),
  });
  useMembers.mockReturnValue(opts.members ?? [makeMember()]);
  useCategories.mockImplementation((_id: Circle["id"], type: Category["type"]) =>
    (opts.categories ?? [makeCategory()]).filter((c) => c.type === type),
  );
  return render(
    <MemoryRouter>
      <CircleTransactions />
    </MemoryRouter>,
  );
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

  it("renders a Load more control and calls loadMore when more pages remain", async () => {
    const user = userEvent.setup();
    const loadMore = vi.fn();
    setup({ transactions: [makeTransaction()], status: "CanLoadMore", loadMore });

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledTimes(1);
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
      categories: [{ id: "cat-salary" as Category["id"], name: "Salary", color: "teal" }],
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
        makeCategory({ id: "i1" as Category["id"], name: "Salary", type: "income" }),
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
        makeMember({ id: "mem-alex" as Member["id"], displayName: "Alex", isSelf: false }),
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

  it("keeps the submit disabled until title, amount, and a category are set", async () => {
    const user = userEvent.setup();
    setup({ categories: [makeCategory({ name: "Groceries", type: "expense" })] });
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    const form = screen.getByRole("form", { name: /add expense/i });
    const submit = within(form).getByRole("button", { name: "Add expense" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Title"), "Weekly shop");
    await user.type(screen.getByLabelText(/Amount/), "10");
    expect(submit).toBeDisabled(); // still no category
    await user.click(screen.getByRole("button", { name: "Groceries" }));
    expect(submit).toBeEnabled();
  });

  it("surfaces a generic error when the create fails", async () => {
    const user = userEvent.setup();
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
});
