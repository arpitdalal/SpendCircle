import { href, Outlet, useOutletContext } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { CircleTabs } from "~/components/circle-tabs.js";
import { Splash } from "~/components/splash.js";
import { type Circle, useResolvedCircle } from "~/lib/use-resolved-circle.js";

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
        <CircleMark mark={circle.mark} color={circle.color} className="size-11 text-base" />
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{circle.name}</h1>
          <p className="text-xs text-muted-foreground">
            {circle.kind === "personal" ? "Personal circle" : "Circle"} · {circle.currency}
          </p>
        </div>
      </div>

      <CircleTabs tabs={tabs} />

      <Outlet context={{ circle } satisfies CircleOutletContext} />
    </div>
  );
}
