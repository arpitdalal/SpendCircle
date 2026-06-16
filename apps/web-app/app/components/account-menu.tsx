import { Menu } from "@base-ui/react/menu";
import { Link } from "react-router";
import { Avatar } from "~/components/ui/avatar.js";
import { buttonVariants } from "~/components/ui/button-variants.js";
import { signOut } from "~/lib/auth-client.js";
import type { SessionUser } from "~/lib/session.js";
import { cn } from "~/lib/utils.js";

const menuItemClass =
  "flex cursor-pointer rounded-md px-3 py-2 text-sm text-foreground outline-none select-none data-highlighted:bg-muted/60";

/**
 * Header account control: avatar trigger opens a Base UI `Menu` with identity,
 * Settings navigation, and optional Sign out (ADR 0019 / issue #124).
 */
export function AccountMenu({ user, showSignOut }: { user: SessionUser; showSignOut: boolean }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label="Account menu"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "size-10 shrink-0 rounded-full p-0 focus-visible:ring-offset-background",
        )}
      >
        <Avatar name={user.displayName} image={user.image} className="size-9" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Menu.Popup
            className={cn(
              "min-w-[220px] origin-(--transform-origin) animate-pop-in rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl outline-none",
            )}
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium text-foreground">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Menu.LinkItem
              className={menuItemClass}
              closeOnClick
              render={<Link to="/settings" prefetch="intent" />}
            >
              Settings
            </Menu.LinkItem>
            {showSignOut ? (
              <Menu.Item className={menuItemClass} onClick={() => void signOut()}>
                Sign out
              </Menu.Item>
            ) : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
