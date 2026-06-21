import { Menu } from "@base-ui/react/menu";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button.js";
import { buttonVariants } from "~/components/ui/button-variants.js";
import {
  type Notification,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "~/lib/data/notifications.js";
import { formatAuditTimestamp } from "~/lib/datetime.js";
import { cn } from "~/lib/utils.js";

const menuItemClass =
  "flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm text-foreground outline-none select-none data-disabled:cursor-default data-disabled:opacity-70 data-highlighted:bg-muted/60";

function badgeLabel(count: number, hasMore: boolean) {
  if (hasMore) {
    return "99+ unread notifications";
  }
  if (count === 1) {
    return "1 unread notification";
  }
  return `${count} unread notifications`;
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: Notification["id"]) => void;
}) {
  const timestamp = formatAuditTimestamp(notification.createdAt);
  const content = (
    <>
      <span className={cn("font-medium", !notification.read && "text-foreground")}>
        {notification.title}
      </span>
      {notification.body ? (
        <span className="text-xs text-muted-foreground">{notification.body}</span>
      ) : null}
      <span className="text-xs text-muted-foreground">{timestamp}</span>
    </>
  );

  const handleActivate = () => {
    if (!notification.read) {
      void onMarkRead(notification.id);
    }
  };

  if (notification.link) {
    return (
      <Menu.LinkItem
        className={menuItemClass}
        closeOnClick
        render={<Link to={notification.link} prefetch="intent" onClick={handleActivate} />}
      >
        {content}
      </Menu.LinkItem>
    );
  }

  return (
    <Menu.Item className={menuItemClass} closeOnClick={false} onClick={handleActivate}>
      {content}
    </Menu.Item>
  );
}

/**
 * App-wide Notification Center (NTF-1): bell trigger, capped unread badge, and a
 * dropdown list with access-resolved links (text-only when `link` is absent).
 */
export function NotificationCenter() {
  const notifications = useNotifications() ?? [];
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = unread?.count ?? 0;
  const showBadge = unreadCount > 0 || unread?.hasMore;
  const showMarkAllRead = notifications.length > 0;

  const handleMarkRead = async (notificationId: Notification["id"]) => {
    try {
      await markRead({ notificationId });
    } catch {
      // Own notifications only; swallow so a mid-navigation failure cannot reject.
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll) {
      return;
    }
    setMarkingAll(true);
    try {
      await markAllRead({});
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Notifications"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "relative size-10 shrink-0 rounded-full focus-visible:ring-offset-background",
        )}
      >
        <Bell aria-hidden className="size-5" />
        {showBadge ? (
          <span
            className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-5 text-primary-foreground"
            aria-live="polite"
          >
            <span className="sr-only">{badgeLabel(unreadCount, unread?.hasMore ?? false)}</span>
            <span aria-hidden>{unread?.hasMore ? "99+" : unreadCount}</span>
          </span>
        ) : null}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup
            className={cn(
              "flex max-h-[min(24rem,70dvh)] w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) animate-pop-in flex-col rounded-lg border border-border bg-popover text-popover-foreground shadow-xl outline-none",
            )}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium">Notifications</p>
            </div>
            <ul className="overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <li className="list-none px-3 py-6 text-center text-sm text-muted-foreground">
                  You're all caught up
                </li>
              ) : (
                notifications.map((notification) => (
                  <li key={notification.id} className="list-none">
                    <NotificationRow notification={notification} onMarkRead={handleMarkRead} />
                  </li>
                ))
              )}
            </ul>
            {showMarkAllRead ? (
              <div className="border-t border-border px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={markingAll}
                  aria-busy={markingAll}
                  onClick={() => void handleMarkAllRead()}
                >
                  Mark all read
                </Button>
              </div>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
