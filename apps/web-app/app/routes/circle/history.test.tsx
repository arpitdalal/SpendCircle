import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CircleHistoryEvent, Member, PaginationStatus } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeHistoryEventView,
  makeMemberView,
  renderInCircle,
  testId,
} from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleHistoryPage from "./history.js";

function setup(
  opts: {
    circleHistory?: CircleHistoryEvent[];
    historyStatus?: PaginationStatus;
    historyLoadMore?: () => void;
    members?: Member[];
  } = {},
) {
  configureConvex({
    members: opts.members,
    circleHistory: opts.circleHistory,
    historyStatus: opts.historyStatus,
    historyLoadMore: opts.historyLoadMore,
  });
  return renderInCircle(makeCircleView(), <CircleHistoryPage />);
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

describe("CircleHistoryPage — history panel (CS-4)", () => {
  it("renders circle history newest-first with actor, action, and field changes", () => {
    setup({
      members: [owner, maya],
      circleHistory: [
        makeHistoryEventView({
          id: testId<CircleHistoryEvent["id"]>("h2"),
          action: "ownership transferred",
          actor: { displayName: "Olive Owner", image: undefined },
          changes: [{ field: "owner", from: "Olive Owner", to: "Maya Member" }],
        }),
        makeHistoryEventView({
          id: testId<CircleHistoryEvent["id"]>("h1"),
          action: "created",
          changes: [{ field: "name", to: "Trip" }],
        }),
      ],
    });

    const panel = screen.getByRole("region", { name: "Circle history" });
    expect(within(panel).getAllByText("Olive Owner").length).toBeGreaterThan(0);
    expect(within(panel).getByText("transferred ownership")).toBeInTheDocument();
    expect(within(panel).getByText("Owner:")).toBeInTheDocument();
    expect(within(panel).getByText("Maya Member")).toBeInTheDocument();
    expect(within(panel).getByText("created")).toBeInTheDocument();
    expect(within(panel).getByText("Name:")).toBeInTheDocument();
  });

  it("shows the empty history state when there are no events", () => {
    setup({ members: [owner, maya], circleHistory: [] });
    const panel = screen.getByRole("region", { name: "Circle history" });
    expect(within(panel).getByText("No history yet.")).toBeInTheDocument();
  });

  it("keeps a manual Load more control when more pages exist", async () => {
    const user = userEvent.setup();
    const historyLoadMore = vi.fn();
    setup({
      members: [owner, maya],
      circleHistory: [makeHistoryEventView({ action: "created" })],
      historyStatus: "CanLoadMore",
      historyLoadMore,
    });

    const panel = screen.getByRole("region", { name: "Circle history" });
    await user.click(within(panel).getByRole("button", { name: "Load more" }));
    expect(historyLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows circle history for a non-owner member", () => {
    setup({
      members: [
        owner,
        makeMemberView({ ...maya, isSelf: true, role: "member", displayName: "Maya Member" }),
      ],
      circleHistory: [
        makeHistoryEventView({
          id: testId<CircleHistoryEvent["id"]>("h1"),
          action: "member joined",
          changes: [{ field: "member", to: "Maya Member" }],
        }),
      ],
    });

    expect(screen.getByRole("region", { name: "Circle history" })).toBeInTheDocument();
    expect(screen.getByText("joined")).toBeInTheDocument();
  });
});
