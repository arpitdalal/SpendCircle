import { href } from "react-router";

/** A canonical Circle-chrome destination, shared by the desktop tab nav and the
 * mobile bottom bar / "More" sheet so the two can't drift (issue #124). */
export interface CircleNavItem {
  to: string;
  label: string;
  end: boolean;
}

/**
 * The ordered Circle destinations. The desktop nav renders all of them; the mobile
 * bottom bar shows the first three as slots and tucks the rest into the "More" sheet.
 */
export function circleNavItems(circleRef: string): CircleNavItem[] {
  return [
    { to: href("/circles/:circleRef", { circleRef }), label: "Dashboard", end: true },
    {
      to: href("/circles/:circleRef/transactions", { circleRef }),
      label: "Transactions",
      end: false,
    },
    { to: href("/circles/:circleRef/search", { circleRef }), label: "Search", end: false },
    { to: href("/circles/:circleRef/categories", { circleRef }), label: "Categories", end: false },
    { to: href("/circles/:circleRef/members", { circleRef }), label: "Members", end: false },
  ];
}

/** Primary slots get a dedicated bottom-bar button; the remainder live in "More". */
export const PRIMARY_SLOT_COUNT = 3;

/** Active-route test that mirrors `NavLink`'s prefix matching (and `end` for the index). */
export function isCircleNavItemActive(pathname: string, item: CircleNavItem) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
