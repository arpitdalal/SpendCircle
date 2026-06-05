import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member } from "~/lib/data.js";
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

function setup(opts: { members?: Member[] | null } = {}) {
  configureConvex({ members: opts.members });
  return renderInCircle(makeCircleView(), <CircleMembers />);
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

  it("shows a loading state while members resolve", () => {
    setup({ members: undefined });
    expect(screen.getByText(/Loading members/)).toBeInTheDocument();
  });

  it("shows an unavailable state when the query returns null (inaccessible)", () => {
    setup({ members: null });
    expect(screen.getByText(/members are unavailable/i)).toBeInTheDocument();
  });
});
