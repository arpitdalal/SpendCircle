import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { cn } from "~/lib/utils.js";

export interface CircleTab {
  to: string;
  label: string;
  end: boolean;
}

/**
 * The Circle section tab bar. There are 5+ destinations that can grow, so it stays a
 * horizontally scrollable strip (a bottom bar caps at ~5 and would fight the header's Circle
 * switcher) — but the raw scrollbar and hard-clipped "Mem…" of the old bar gave no signal it
 * scrolled. This fixes the affordance with zero extra chrome:
 *
 * - the scrollbar is hidden (it was the eyesore);
 * - scroll-snap gives native momentum with predictable stops;
 * - the edge that still has clipped tabs is FADED (a mask), the canonical "more this way" cue,
 *   shown only on the side(s) actually overflowing;
 * - after navigation the active tab is scrolled into view, so deep links / programmatic nav
 *   never land with it off-screen.
 */
export function CircleTabs({ tabs }: { tabs: CircleTab[] }) {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [overflow, setOverflow] = useState({ start: false, end: false });

  // Track which edges hide clipped tabs, so the fade appears only where there is more to
  // reach. Recomputed on scroll and whenever the bar or its content is resized.
  useEffect(() => {
    const el = navRef.current;
    if (!el) {
      return;
    }
    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setOverflow({ start: el.scrollLeft > 1, end: el.scrollLeft < maxScroll - 1 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);

  // Keep the active tab visible after navigation. Scroll only the bar (never the page) and only
  // when the tab actually overhangs an edge, so a click on an in-view tab stays still. `pathname`
  // is purely the re-run trigger here — the effect reads the live DOM (`aria-current`), not it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the navigation re-run trigger, not read in the body.
  useEffect(() => {
    const el = navRef.current;
    const active = el?.querySelector<HTMLElement>("[aria-current='page']");
    if (!el || !active) {
      return;
    }
    const navBox = el.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    const startGap = tabBox.left - navBox.left;
    const endGap = tabBox.right - navBox.right;
    if (startGap < 0) {
      el.scrollBy?.({ left: startGap - 16, behavior: "smooth" });
    } else if (endGap > 0) {
      el.scrollBy?.({ left: endGap + 16, behavior: "smooth" });
    }
  }, [pathname]);

  const maskImage = edgeFadeMask(overflow);

  return (
    <nav
      ref={navRef}
      aria-label="Circle sections"
      // The fade is driven by live scroll state, so it can't be a static utility.
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      className="-mx-4 flex snap-x scroll-pl-4 gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "shrink-0 snap-start border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** A horizontal mask that fades whichever edge(s) still hide tabs; `undefined` when none do. */
function edgeFadeMask({ start, end }: { start: boolean; end: boolean }) {
  if (!start && !end) {
    return undefined;
  }
  const from = start ? "transparent" : "black";
  const to = end ? "transparent" : "black";
  return `linear-gradient(to right, ${from}, black 2rem, black calc(100% - 2rem), ${to})`;
}
