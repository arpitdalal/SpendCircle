import { href, NavLink, Outlet, useOutletContext } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { Splash } from "~/components/splash.js";
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

  if (resolution.status === "pending") {
    return <Splash label="Opening circle…" />;
  }

  const circle = resolution.value;
  const tabs = [
    { to: href("/circles/:circleRef", { circleRef: circle.ref }), label: "Dashboard", end: true },
    {
      to: href("/circles/:circleRef/transactions", { circleRef: circle.ref }),
      label: "Transactions",
      end: false,
    },
    {
      to: href("/circles/:circleRef/search", { circleRef: circle.ref }),
      label: "Search",
      end: false,
    },
    {
      to: href("/circles/:circleRef/categories", { circleRef: circle.ref }),
      label: "Categories",
      end: false,
    },
    {
      to: href("/circles/:circleRef/members", { circleRef: circle.ref }),
      label: "Members",
      end: false,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <CircleMark mark={circle.mark} color={circle.color} />
        <div>
          <h1 className="text-lg font-semibold">{circle.name}</h1>
          <p className="text-xs text-neutral-500">
            {circle.kind === "personal" ? "Personal circle" : "Circle"} · {circle.currency}
          </p>
        </div>
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-neutral-800 px-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }: { isActive: boolean }) =>
              cn(
                "shrink-0 border-b-2 px-3 py-2 text-sm",
                isActive
                  ? "border-neutral-100 text-neutral-100"
                  : "border-transparent text-neutral-400 hover:text-neutral-100",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ circle } satisfies CircleOutletContext} />
    </div>
  );
}
