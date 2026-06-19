import { useState } from "react";

/**
 * Runs `onChange` during render the first commit after `value` changes — the
 * React-canonical "adjusting state when a value changes" pattern (react.dev,
 * "You Might Not Need an Effect" → *Storing information from previous renders*).
 *
 * Prefer this over the two patterns it replaces (ADR 0025):
 *  - a `useEffect` that watches `value`: that reaction runs AFTER paint, so any
 *    state it resets shows one stale frame first;
 *  - a render-time `useRef` mutation (`prev.current = value`): StrictMode- and
 *    concurrent-unsafe — a discarded render advances the ref without committing,
 *    so the committed change is missed (the bug fixed in #159).
 *
 * Contract: `onChange` MUST only update state (call a `setX`). React restarts the
 * render synchronously when it does, and the new `value` identity terminates the
 * comparison on the retry. Side effects (network, DOM, refs, logging, navigation)
 * are NOT allowed during render — those belong in an event handler or an Effect.
 *
 * React Compiler: do not wrap the `onChange` you pass in `useCallback`. This hook
 * never depends on its identity — it is invoked synchronously in the same render
 * and never stored — and the compiler owns referential stability for callers.
 */
export function useValueChange<T>(value: T, onChange: (current: T, previous: T) => void): void {
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers -- `previous` IS read during render (the comparison) to drive React's blessed "adjust state during render" reset; centralized here so call sites need no per-file suppression. The rule only checks JSX-reachability, so it misfires.
  const [previous, setPrevious] = useState(value);
  if (!Object.is(value, previous)) {
    setPrevious(value);
    onChange(value, previous);
  }
}
