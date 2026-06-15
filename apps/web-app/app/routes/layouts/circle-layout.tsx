import { NavLink, Outlet, useOutletContext } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { CircleMobileBottomNav } from "~/components/circle-mobile-bottom-nav.js";
import { PageSkeleton } from "~/components/skeleton.js";
import { Splash } from "~/components/splash.js";
import { circleNavItems } from "~/lib/circle-nav.js";
import { coversCircleNavigation, usePendingRouteSkeleton } from "~/lib/route-skeleton.js";
import { type Circle, useResolvedCircle } from "~/lib/use-resolved-circle.js";
import { cn } from "~/lib/utils.js";

export interface CircleOutletContext {
  circle: Circle;
}

/** Reads the resolved Circle provided by the Circle guard layout. */
export function useCircle(): Circle {
  return useOutletContext<CircleOutletContext>().circle;
}

/**
 * Circle guard layout for `/circles/:circleRef`. Resolves, canonicalizes, and
 * guards the Circle, then provides it to children via Outlet context (ADR 0017).
 */
export default function CircleLayout() {
  const resolution = useResolvedCircle();
  // Hooks run unconditionally (the Splash early-return is below), so the pending-
  // navigation subscription is stable across the guard's pending → resolved flip.
  const showSkeleton = usePendingRouteSkeleton(coversCircleNavigation);

  if (resolution.status === "pending") {
    return <Splash label="Opening circle…" />;
  }

  const circle = resolution.value;
  const tabs = circleNavItems(circle.ref);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <CircleMark mark={circle.mark} color={circle.color} className="size-11 text-base" />
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{circle.name}</h1>
          <p className="text-xs text-muted-foreground">
            {circle.kind === "personal" ? "Personal circle" : "Circle"} · {circle.currency}
          </p>
        </div>
      </div>

      <nav
        aria-label="Circle tabs"
        className="-mx-4 hidden gap-1 overflow-x-auto border-b border-border px-4 sm:flex"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            prefetch="intent"
            className={({ isActive }) =>
              cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm transition-colors duration-150",
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

      <CircleMobileBottomNav circle={circle} />

      {showSkeleton ? (
        <PageSkeleton />
      ) : (
        <Outlet context={{ circle } satisfies CircleOutletContext} />
      )}
    </div>
  );
}
