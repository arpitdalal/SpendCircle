import { Dialog } from "@base-ui/react/dialog";
import {
  LayoutDashboard,
  type LucideIcon,
  MoreHorizontal,
  Receipt,
  Search,
  Tags,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { buttonVariants } from "~/components/ui/button-variants.js";
import {
  mobileSheetBackdropClassName,
  mobileSheetPopupBaseClassName,
} from "~/components/ui/mobile-sheet-primitives.js";
import { circleNavItems, isCircleNavItemActive, PRIMARY_SLOT_COUNT } from "~/lib/circle-nav.js";
import type { Circle } from "~/lib/data.js";
import { cn } from "~/lib/utils.js";

const iconForLabel: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  Transactions: Receipt,
  Search,
  Categories: Tags,
  Members: Users,
};

function slotClass(isActive: boolean) {
  return cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors duration-150 min-w-0",
    isActive
      ? "font-medium text-foreground [&_svg]:text-primary"
      : "text-muted-foreground hover:text-foreground [&_svg]:text-muted-foreground",
  );
}

/**
 * Circle-scoped mobile bottom bar + "More" sheet (ADR 0022, issue #124). Renders only
 * below `sm`; desktop uses the horizontal tab nav in `circle-layout.tsx`. Both navs
 * read their destinations from `circleNavItems` so they can't drift.
 */
export function CircleMobileBottomNav({ circle }: { circle: Circle }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = circleNavItems(circle.ref);
  const primarySlots = items.slice(0, PRIMARY_SLOT_COUNT);
  const moreItems = items.slice(PRIMARY_SLOT_COUNT);

  const moreActive = moreItems.some((item) => isCircleNavItemActive(location.pathname, item));

  // biome-ignore lint/correctness/useExhaustiveDependencies: collapse More whenever the router location changes; Biome treats `setMoreOpen` as the only "needed" dep, which would run once and never again.
  useEffect(() => {
    setMoreOpen(false);
  }, [location]);

  return (
    <>
      <nav
        aria-label="Circle"
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        data-testid="circle-mobile-bottom-nav"
      >
        {primarySlots.map((item) => {
          const Icon = iconForLabel[item.label];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => slotClass(isActive)}
            >
              {Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          aria-current={moreActive ? "page" : undefined}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          className={slotClass(moreActive)}
        >
          <MoreHorizontal aria-hidden className="size-5 shrink-0" />
          <span className="truncate">More</span>
        </button>
      </nav>

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={mobileSheetBackdropClassName} />
          <Dialog.Popup
            className={cn(
              mobileSheetPopupBaseClassName,
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <Dialog.Title className="text-sm font-medium text-foreground">More</Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
              >
                <X aria-hidden className="size-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Categories and members navigation for this circle.
            </Dialog.Description>
            <div className="flex flex-col gap-1 px-4 pb-4 pt-2">
              {moreItems.map((item) => {
                const Icon = iconForLabel[item.label];
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                        isActive
                          ? "bg-muted font-medium text-foreground [&_svg]:text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground [&_svg]:text-muted-foreground",
                      )
                    }
                  >
                    {Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null}
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
