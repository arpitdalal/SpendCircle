import { Link, href } from "react-router";
import { Splash } from "~/components/splash.js";
import { useMyCircles } from "~/lib/data.js";

/** Home: the User's Circles, Personal Circle first. The default safe route. */
export default function Home() {
  const circles = useMyCircles();

  if (circles === undefined) {
    return <Splash label="Loading your circles…" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Your circles</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {circles.map((circle) => (
          <li key={circle.id}>
            <Link
              to={href("/circles/:circleRef", { circleRef: circle.ref })}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 p-4 hover:border-neutral-600"
            >
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-md bg-neutral-800 text-sm font-semibold"
              >
                {circle.mark}
              </span>
              <span>
                <span className="block font-medium">{circle.name}</span>
                <span className="block text-xs text-neutral-500">
                  {circle.kind === "personal" ? "Personal" : "Circle"} · {circle.currency}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
