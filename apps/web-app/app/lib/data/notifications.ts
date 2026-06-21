import { api } from "@spend-circle/convex";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "../env.js";
import { MOCK_NOTIFICATIONS } from "../fixtures.js";
import type { PaginationStatus } from "./transactions.js";

/** How many notifications to fetch per page (initial load and each "load more"). */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * One notification view row, derived from `listNotifications` so the client
 * contract cannot drift from the backend (ADR 0003).
 */
export type Notification = FunctionReturnType<
  typeof api.notifications.listNotifications
>["page"][number];

export type UnreadCount = FunctionReturnType<typeof api.notifications.getUnreadCount>;

export interface PaginatedNotifications {
  notifications: Notification[];
  status: PaginationStatus;
  loadMore: () => void;
}

/** The caller's notifications, newest first, paginated at the source. */
export function useNotifications(): PaginatedNotifications {
  const paginated = usePaginatedQuery(api.notifications.listNotifications, MOCKS ? "skip" : {}, {
    initialNumItems: NOTIFICATIONS_PAGE_SIZE,
  });
  if (MOCKS) {
    return { notifications: MOCK_NOTIFICATIONS, status: "Exhausted", loadMore: () => {} };
  }
  return {
    notifications: paginated.results,
    status: paginated.status,
    loadMore: () => paginated.loadMore(NOTIFICATIONS_PAGE_SIZE),
  };
}

/** Unread count for the header badge (`99+` when capped). */
export function useUnreadCount(): UnreadCount | undefined {
  const live = useQuery(api.notifications.getUnreadCount, MOCKS ? "skip" : {});
  if (MOCKS) {
    const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;
    return { count: unread, hasMore: false };
  }
  return live;
}

export function useMarkNotificationRead() {
  const mutation = useMutation(api.notifications.markNotificationRead);
  if (MOCKS) {
    return async () => {};
  }
  return mutation;
}

export function useMarkAllRead() {
  const mutation = useMutation(api.notifications.markAllRead);
  if (MOCKS) {
    return async () => {};
  }
  return mutation;
}
