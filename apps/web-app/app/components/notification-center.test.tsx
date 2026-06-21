import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "~/components/notification-center.js";
import { MOCK_NOTIFICATIONS } from "~/lib/fixtures.js";
import { configureConvex, makeNotificationView, renderRoutes } from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

afterEach(() => {
  vi.clearAllMocks();
});

async function openNotifications(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Notifications" }));
}

describe("NotificationCenter", () => {
  it("renders linked and text-only items from mock fixtures", async () => {
    configureConvex({
      notifications: MOCK_NOTIFICATIONS,
      unreadCount: { count: 1, hasMore: false },
    });
    const user = userEvent.setup();
    renderRoutes(<Route path="/" element={<NotificationCenter />} />, { initialEntries: ["/"] });

    await openNotifications(user);

    expect(await screen.findByText("Paid By updated")).toBeInTheDocument();
    expect(screen.getByText("Removed from Circle")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Paid By updated/ })).toHaveAttribute(
      "href",
      MOCK_NOTIFICATIONS[0]?.link,
    );
    expect(screen.queryByRole("menuitem", { name: /Removed from Circle/ })).not.toHaveAttribute(
      "href",
    );
  });

  it("marks an unread item read when clicked", async () => {
    const markNotificationRead = vi.fn().mockResolvedValue(undefined);
    configureConvex({
      notifications: [makeNotificationView({ title: "Unread ping", read: false })],
      unreadCount: { count: 1, hasMore: false },
      markNotificationRead,
    });
    const user = userEvent.setup();
    renderRoutes(<Route path="/" element={<NotificationCenter />} />, { initialEntries: ["/"] });

    await openNotifications(user);
    await user.click(await screen.findByRole("menuitem", { name: /Unread ping/ }));

    expect(markNotificationRead).toHaveBeenCalledWith({
      notificationId: expect.any(String),
    });
  });

  it("mark all read clears the badge via mutation", async () => {
    const markAllRead = vi.fn().mockResolvedValue(undefined);
    configureConvex({
      notifications: [makeNotificationView()],
      unreadCount: { count: 2, hasMore: false },
      markAllRead,
    });
    const user = userEvent.setup();
    renderRoutes(<Route path="/" element={<NotificationCenter />} />, { initialEntries: ["/"] });

    await openNotifications(user);
    await user.click(await screen.findByRole("button", { name: "Mark all read" }));

    expect(markAllRead).toHaveBeenCalledWith({});
  });

  it("shows 99+ when unread count is capped", async () => {
    configureConvex({
      notifications: [],
      unreadCount: { count: 99, hasMore: true },
    });
    renderRoutes(<Route path="/" element={<NotificationCenter />} />, { initialEntries: ["/"] });

    expect(screen.getByText("99+")).toBeInTheDocument();
    expect(screen.getByText("99+ unread notifications")).toBeInTheDocument();
  });
});
