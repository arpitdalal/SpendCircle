import { colorLabel } from "@spend-circle/domain";
import { href, Link } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { Splash } from "~/components/splash.js";
import { Button } from "~/components/ui/button.js";
import { useMyCircles } from "~/lib/data.js";

/** Home: the User's Circles, Personal Circle first. The default safe route. */
export default function Home() {
  const circles = useMyCircles();

  if (circles === undefined) {
    return <Splash label="Loading your circles…" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Your circles</h1>
        <Button asChild>
          <Link to={href("/circles/new")}>Create circle</Link>
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {circles.map((circle) => (
          <li key={circle.id}>
            <Link
              to={href("/circles/:circleRef", { circleRef: circle.ref })}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 p-4 hover:border-neutral-600"
            >
              <CircleMark mark={circle.mark} color={circle.color} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{circle.name}</span>
                {/* Color label as real text disambiguates same-named Circles (PRD 10)
                    for screen-reader and color-blind users, since the color chip is
                    aria-hidden and Circle Color must not be the sole identifier
                    (CONTEXT: Circle Color). */}
                <span className="block truncate text-xs text-neutral-500">
                  {circle.kind === "personal" ? "Personal" : "Circle"} · {circle.currency} ·{" "}
                  {colorLabel(circle.color)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
