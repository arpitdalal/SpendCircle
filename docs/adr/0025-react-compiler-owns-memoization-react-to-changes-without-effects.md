# React Compiler owns memoization; react to changed values without effects or render-time refs

We adopt React Compiler as the owner of referential stability, and we standardize
the three patterns that the compiler does **not** subsume — reading a fresh value
inside an Effect, reading a fresh value inside an event handler, and reacting to a
value that changed between commits. Each gets exactly one blessed tool, so the
"memo and callback fuss" disappears and the remaining hooks express intent rather
than plumbing.

This replaces an ad-hoc mix that produced three different idioms for the same
need in a single day (#156, #159, #161) and two regressions caused by reaching for
the wrong one: a StrictMode-unsafe render-time `useRef` mutation in the mobile nav
(#159) and a stale-closure Enter flush in the debounced search box (#161).

## Decision

### 1. React Compiler owns memoization — stop hand-writing it

Once the compiler is enabled (`babel-plugin-react-compiler`), do **not** add
`useMemo`, `useCallback`, or `React.memo` for referential stability or render
cost. The compiler memoizes components and values automatically. Remove existing
hand-rolled memoization as files are touched; keep `useMemo` only for the rare
case of a genuinely required stable identity the compiler cannot infer (document
why inline). Refs used purely to mirror the latest prop/callback
(`normalizeRef.current = normalize`) are memoization in disguise — delete them.

### 2. Fresh value inside an Effect → `useEffectEvent`

When an Effect (or a timer/subscription it owns) must call the latest prop or
callback **without** re-subscribing on every change, wrap that call in
`useEffectEvent` (React 19.2, stable). It is the canonical primitive for this and
is **complementary to** — not replaced by — the compiler. Do not mirror the
callback into a `useRef`.

### 3. Fresh value inside an event handler → just read the prop

Event handlers always close over the current render's props. Read `onSearch` /
`normalize` directly in `onKeyDown`; do not route them through `useEffectEvent`
(Effect Events may only be called from Effects) or through a ref. The duplicated
`flush`/`commitRaw` plumbing in #161 came from missing this: the Effect path needs
an Effect Event, the handler path needs nothing.

### 4. React to a value that changed between commits → `useValueChange`

To reset or close something when a value changes (e.g. close the More sheet on
navigation), use the shared `useValueChange(value, onChange)` helper
(`apps/web-app/app/lib/use-value-change.ts`). It encodes React's "adjusting state
when a value changes" pattern: compare against the previous value during render
and update state synchronously, so the reset lands in the **same commit** with no
stale frame.

- **Not** a `useEffect([value])`: that runs after paint and shows a stale frame.
- **Not** a render-time `useRef` mutation: a discarded StrictMode/concurrent
  render advances the ref without committing and the change is missed (#159).

`onChange` may **only** update state. Side effects (network, DOM, navigation,
logging) stay in event handlers or Effects.

## Consequences

- `DebouncedSearchInput` collapses to: a single `useEffectEvent` for the debounce
  Effect, a direct prop read in the Enter handler, and no `normalizeRef` /
  `onSearchRef` / `clearPending` / `useCallback`. The committed-but-pending timer
  is harmless once the commit guard (`applied.current`) makes a late fire a no-op.
- `CircleMobileBottomNav` calls `useValueChange(routeLocation, () => setMoreOpen(false))`
  instead of inlining the previous-location state machine.
- The `react-doctor/rerender-state-only-in-handlers` suppression for the
  during-render reset lives **once**, inside `useValueChange`, instead of at every
  call site. react-doctor remains advisory: we do not chase its score at the cost
  of correctness, which is what manufactured the #156→#157→#169 churn.
- Enabling the compiler is a follow-up step (Babel/Vite plugin + ESLint
  `react-hooks` recommended rules). This ADR is the convention the migration
  lands against; it stands on its own before the plugin is wired, because
  `useEffectEvent` and `useValueChange` are correct with or without the compiler.
- Tests assert behavior (no stale frame, single fire on change), not the presence
  of `useMemo`/`useCallback`, so removing hand-memoization under the compiler does
  not churn tests (ADR 0006).
