import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Circle, Member } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeMemberView,
  renderInCircle,
  testId,
} from "~/test/convex-react.js";

/**
 * Behavior test for the Member List surface (jsdom). Only `convex/react` is
 * doubled (the shared helper); the real `useMembers` hook, the real `useCircle`
 * Outlet seam, and the real route logic run against the modeled backend state, so
 * a drift between the route, the data layer, and the `listMembers` contract is
 * caught here rather than mocked away (ADR 0006).
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleMembers from "./members.js";

function setup(opts: { members?: Member[] | null; createInvitation?: Mock; circle?: Circle } = {}) {
  configureConvex({ members: opts.members, createInvitation: opts.createInvitation });
  return renderInCircle(opts.circle ?? makeCircleView(), <CircleMembers />);
}

const owner = makeMemberView({
  id: testId<Member["id"]>("mem-owner"),
  displayName: "Olive Owner",
  role: "owner",
  isSelf: false,
});
const maya = makeMemberView({
  id: testId<Member["id"]>("mem-maya"),
  displayName: "Maya Member",
  role: "member",
  isSelf: false,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleMembers", () => {
  it("lists members in the order the query returns them (Owner-first)", () => {
    setup({ members: [owner, maya] });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Olive Owner");
    expect(items[1]).toHaveTextContent("Maya Member");
  });

  it("shows an Owner badge for the Owner only", () => {
    setup({ members: [owner, maya] });
    const badges = screen.getAllByText("Owner"); // exact: the badge, not the name "Olive Owner"
    expect(badges).toHaveLength(1);
    expect(screen.getByText("Olive Owner").closest("li")).toContainElement(badges[0] ?? null);
  });

  it("marks the calling Member with (You)", () => {
    setup({ members: [owner, makeMemberView({ ...maya, isSelf: true })] });
    const marks = screen.getAllByText("(You)");
    expect(marks).toHaveLength(1);
    expect(screen.getByText("Maya Member").closest("li")).toContainElement(marks[0] ?? null);
  });

  it("renders the Profile Picture when present", () => {
    const { container } = setup({
      members: [makeMemberView({ ...owner, image: "https://example.com/olive.png" })],
    });
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/olive.png");
  });

  it("renders a generated initials avatar when there is no Profile Picture", () => {
    const { container } = setup({ members: [owner] });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("OO")).toBeInTheDocument();
  });

  it("renders exactly one row for a Personal Circle", () => {
    setup({ members: [makeMemberView({ displayName: "You", isSelf: true })] });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows a skeleton while members resolve", () => {
    setup({ members: undefined });
    const skeleton = screen.getByTestId("members-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(within(skeleton).getByText(/Loading members/)).toBeInTheDocument();
  });

  it("shows an unavailable state when the query returns null (inaccessible)", () => {
    setup({ members: null });
    expect(screen.getByText(/members are unavailable/i)).toBeInTheDocument();
  });
});

describe("CircleMembers — invite form", () => {
  it("shows the invite form for the Owner", () => {
    setup({
      members: [makeMemberView({ displayName: "Olive Owner", role: "owner", isSelf: true })],
    });
    expect(screen.getByRole("form", { name: "Invite member" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("hides the invite form for a non-owner Member", () => {
    setup({
      members: [
        owner,
        makeMemberView({ ...maya, isSelf: true, role: "member", displayName: "Maya Member" }),
      ],
    });
    expect(screen.queryByRole("form", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("hides the invite form on a Personal Circle", () => {
    setup({
      circle: makeCircleView({ kind: "personal" }),
      members: [makeMemberView({ displayName: "You", role: "owner", isSelf: true })],
    });
    expect(screen.queryByRole("form", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it("shows a field error for an invalid email without calling the mutation", async () => {
    const createInvitation = vi.fn();
    const user = userEvent.setup();
    setup({
      members: [makeMemberView({ displayName: "Olive Owner", role: "owner", isSelf: true })],
      createInvitation,
    });

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Invite member" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("shows a success confirmation on invite and disables submit while in-flight", async () => {
    const createInvitation = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(undefined), 50);
        }),
    );
    const user = userEvent.setup();
    setup({
      members: [makeMemberView({ displayName: "Olive Owner", role: "owner", isSelf: true })],
      createInvitation,
    });

    await user.type(screen.getByLabelText("Email address"), "ada@example.com");
    const submit = screen.getByRole("button", { name: "Invite member" });
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Inviting…");

    expect(await screen.findByRole("status")).toHaveTextContent(
      /invitation sent to ada@example\.com/i,
    );
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
    expect(createInvitation).toHaveBeenCalledWith({
      circleId: makeCircleView().id,
      email: "ada@example.com",
    });
  });

  it("maps a coded mutation error to shared user copy", async () => {
    const createInvitation = vi
      .fn()
      .mockRejectedValue(new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteAlreadyPending)));
    const user = userEvent.setup();
    setup({
      members: [makeMemberView({ displayName: "Olive Owner", role: "owner", isSelf: true })],
      createInvitation,
    });

    await user.type(screen.getByLabelText("Email address"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Invite member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      MUTATION_ERRORS.inviteAlreadyPending.message,
    );
  });
});
