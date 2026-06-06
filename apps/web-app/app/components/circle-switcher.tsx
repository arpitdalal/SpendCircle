import { useEffect, useId, useRef, useState } from "react";
import { href, Link } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { type Circle, useMyCircles } from "~/lib/data.js";
import { cn } from "~/lib/utils.js";

/**
 * The Circle switcher in the app shell (CS-0) — the navigation backbone every
 * collaboration and reporting slice leans on. A disclosure button reveals the
 * User's own Circles (`useMyCircles`, Personal Circle first — the query already
 * orders them), each a canonical-ref link (ADR 0016), plus a Create Circle entry.
 *
 * There is NO Circle discovery (PRD 24): the menu lists only Circles the User is a
 * Member of, which is exactly what `listMyCircles` returns — the switcher never
 * queries or exposes anyone else's Circles.
 *
 * Hand-built (not a Radix menu — the project has no popover primitive yet) but kept
 * accessible: the trigger carries `aria-haspopup`/`aria-expanded`/`aria-controls`,
 * the panel is a labelled menu of links, Escape closes and returns focus to the
 * trigger, and an outside click closes it. Selecting an item navigates (a real
 * Link) and closes the menu.
 */
export function CircleSwitcher() {
  const circles = useMyCircles();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on an outside click and on Escape; Escape also restores focus to the
  // trigger so keyboard users aren't stranded. Only wired while open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
      >
        Circles
        <span
          aria-hidden
          className={cn("text-neutral-500 transition-transform", open && "rotate-180")}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Your circles"
          className="absolute left-0 z-50 mt-1 w-64 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-lg"
        >
          <CircleItems circles={circles} onSelect={() => setOpen(false)} />
          <div className="my-1 border-t border-neutral-800" />
          <Link
            role="menuitem"
            to={href("/circles/new")}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-600 text-base text-neutral-400"
            >
              +
            </span>
            Create circle
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** The Circle rows of the open menu — loading, then the User's own Circles as
 * canonical-ref links. (An empty list never happens in practice: every User keeps a
 * Personal Circle — but it degrades to just the Create entry rather than crashing.) */
function CircleItems({
  circles,
  onSelect,
}: {
  circles: Circle[] | undefined;
  onSelect: () => void;
}) {
  if (circles === undefined) {
    return (
      <p className="px-3 py-2 text-sm text-neutral-500" aria-live="polite">
        Loading circles…
      </p>
    );
  }

  return (
    <>
      {circles.map((circle) => (
        <Link
          key={circle.id}
          role="menuitem"
          to={href("/circles/:circleRef", { circleRef: circle.ref })}
          onClick={onSelect}
          className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-neutral-800"
        >
          <CircleMark mark={circle.mark} color={circle.color} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{circle.name}</span>
            <span className="block text-xs text-neutral-500">
              {circle.kind === "personal" ? "Personal" : "Circle"} · {circle.currency}
            </span>
          </span>
        </Link>
      ))}
    </>
  );
}
