import { Dialog } from "@base-ui/react/dialog";
import { LayoutDashboard, MoreHorizontal, Receipt, Search, Tags, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { href, NavLink, useLocation } from "react-router";
import {
  mobileSheetBackdropClassName,
  mobileSheetPopupBaseClassName,
} from "~/components/ui/mobile-sheet-primitives.js";
import type { Circle } from "~/lib/data.js";
import { cn } from "~/lib/utils.js";

function slotClass(isActive: boolean) {
  return cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors duration-150",
    isActive
      ? "font-medium text-foreground [&_svg]:text-primary"
      : "text-muted-foreground hover:text-foreground [&_svg]:text-muted-foreground",
  );
}

/**
 * Circle-scoped mobile bottom bar + "More" sheet (ADR 0022, issue #124). Renders only
 * below `sm`; desktop uses the horizontal tab nav in `circle-layout.tsx`.
 */
export function CircleMobileBottomNav({ circle }: { circle: Circle }) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const dashboardTo = href("/circles/:circleRef", { circleRef: circle.ref });
  const transactionsTo = href("/circles/:circleRef/transactions", { circleRef: circle.ref });
  const searchTo = href("/circles/:circleRef/search", { circleRef: circle.ref });
  const categoriesTo = href("/circles/:circleRef/categories", { circleRef: circle.ref });
  const membersTo = href("/circles/:circleRef/members", { circleRef: circle.ref });

  const moreActive = location.pathname === categoriesTo || location.pathname === membersTo;

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
        <NavLink
          to={dashboardTo}
          end
          className={({ isActive }) => cn(slotClass(isActive), "min-w-0")}
        >
          <LayoutDashboard aria-hidden className="size-5 shrink-0" />
          <span className="truncate">Dashboard</span>
        </NavLink>
        <NavLink
          to={transactionsTo}
          className={({ isActive }) => cn(slotClass(isActive), "min-w-0")}
        >
          <Receipt aria-hidden className="size-5 shrink-0" />
          <span className="truncate">Transactions</span>
        </NavLink>
        <NavLink to={searchTo} className={({ isActive }) => cn(slotClass(isActive), "min-w-0")}>
          <Search aria-hidden className="size-5 shrink-0" />
          <span className="truncate">Search</span>
        </NavLink>
        <button
          type="button"
          aria-current={moreActive ? "page" : undefined}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          className={cn(slotClass(moreActive), "min-w-0")}
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
            <Dialog.Title className="sr-only">More</Dialog.Title>
            <Dialog.Description className="sr-only">
              Categories and members navigation for this circle.
            </Dialog.Description>
            <div className="flex flex-col gap-1 p-4">
              <NavLink
                to={categoriesTo}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground [&_svg]:text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground [&_svg]:text-muted-foreground",
                  )
                }
              >
                <Tags aria-hidden className="size-5 shrink-0" />
                Categories
              </NavLink>
              <NavLink
                to={membersTo}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground [&_svg]:text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground [&_svg]:text-muted-foreground",
                  )
                }
              >
                <Users aria-hidden className="size-5 shrink-0" />
                Members
              </NavLink>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
