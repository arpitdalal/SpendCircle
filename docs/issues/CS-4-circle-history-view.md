# CS-4 · Circle History view

| | |
|---|---|
| **Status** | Done |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | CS-0 (Done), CS-2 (Done), MEM membership/ownership events (landed). CS-3 currency event (Todo) — see note below |
| **PRD stories** | 79, 80 |
| **ADRs** | 0016, 0018, 0028 |
| **Glossary** | Circle History |

## Intent

The read surface over a Circle's audit (PRD 79): ownership transfers, Members added/removed,
Circle archived/restored, Circle renamed, Invitation actions, and Circle Settings changes (color,
Currency, Setup answers), showing old/new values and actor + affected Member — with **no raw
internal IDs** (PRD 80) and no invitee email for non-Owners (ADR 0028). The events themselves are
already written by `circles.ts`, `members.ts`, and `invitations.ts` via `recordEvent`; **this slice
only surfaces them** (a pure read). Any current Member can view Circle History, including for an
Archived Circle (history is view-only).

## What already exists (don't rebuild)

The audit and its read primitives are landed and reused as-is:

- **Write side** — `recordEvent` / `circleEntity` in [`history.ts`](../../packages/convex/convex/history.ts).
  Events recorded against the Circle entity today:
  - `circles.ts`: `created`, `renamed`, `settings_changed` (color + `setup.*` answers),
    `setup_completed`, `archived`, `restored`.
  - `members.ts`: `ownership transferred` (`field: owner`), `member removed` /
    `member left` (`field: member`, frozen Display Name).
  - `invitations.ts`: `member invited` / `invitation resent` / `invitation revoked`
    (`field: email`), `member joined` (`field: member`).
- **Read primitive** — `paginateEntityHistory` + `newActorCache` / `toHistoryEventView`
  ([`historyView.ts`](../../packages/convex/convex/historyView.ts)) freeze the actor to a
  Display Name + image, with Circle History omitting Invitation email changes for non-Owners at
  read time (already ID-free, ADR 0018/0021/0028).
- **Shared UI** — `HistoryList` ([`history-list.tsx`](../../apps/web-app/app/components/history-list.tsx))
  renders any entity's paginated events newest-first with a "Load more" control.

**Implemented mirroring Category History (CAT-2):** `listCircleHistory` in
[`circles.ts`](../../packages/convex/convex/circles.ts), `useCircleHistory` in
[`lib/data/history.ts`](../../apps/web-app/app/lib/data/history.ts), Circle History panel on the
member-accessible [`members.tsx`](../../apps/web-app/app/routes/circle/members.tsx) route, and
tests in [`circles.test.ts`](../../packages/convex/convex/circles.test.ts) /
[`members.test.tsx`](../../apps/web-app/app/routes/circle/members.test.tsx).

> **CS-3 note:** Currency is **not** an audited field yet — `updateCircleSettings` only records
> `color` + `setup.*`. The currency-change event lands with CS-3 (Todo). Don't block CS-4 on it:
> build the surface against the events that exist; the currency line renders for free once CS-3
> emits a `currency` field (add the field label per below).

## Implement

- **Convex** (`circles.ts`): `listCircleHistory` paginated query — mirror of `listCategoryHistory`,
  swapping Category resolution for Circle access via `resolveCircleAccess`.
- **Web data hook** ([`lib/data/history.ts`](../../apps/web-app/app/lib/data/history.ts)):
  `useCircleHistory(circleId)` + `CircleHistoryEvent` derived type; `MOCK_CIRCLE_HISTORY` in
  [`fixtures.ts`](../../apps/web-app/app/lib/fixtures.ts).
- **Web label maps** ([`history-list.tsx`](../../apps/web-app/app/components/history-list.tsx)):
  Circle membership/ownership/lifecycle `ACTION_LABEL` / `FIELD_LABEL` entries.
- **Web surface:** Circle History panel on [`members.tsx`](../../apps/web-app/app/routes/circle/members.tsx)
  (member-accessible; Settings redirects non-owners).

## Why this way

- Pure read reusing `paginateEntityHistory`; all formatting/freezing already done at write time,
  so the query adds only access-gating + view mapping.
- Membership/ownership events already carry the affected Member's **frozen Display Name** in
  `changes` (`members.ts` writes `target.displayName`, not an id), so PRD 80 is satisfied by the
  existing writers — CS-4 inherits it, no new write contract needed.
- Paginated (not `.collect()`) because a Circle's audit grows unbounded over its life (README §4).

## How to test

- **Access:** any current Member reads the page ✓ (owner and non-owner); non-member → empty
  exhausted page; archived Circle still readable by current Members.
- **Content:** drive real mutations then assert each event appears with the correct `action`,
  `actor.displayName`, affected Member **by name**, and old/new values. **Assert no raw `Id`
  strings** in any rendered `from`/`to`; assert non-Owners see Invitation action rows without the
  email change while the current Owner sees the email.
- **Order:** newest-first.
- **Pagination:** a bounded first page with `isDone === false` and a usable `continueCursor`.

## Done when

- Current Members (owner or not) can view a complete, ID-free Circle History reflecting settings,
  membership, ownership, Invitation actions, rename, and lifecycle events, newest-first and
  paginated, on a member-accessible surface; non-Owners do not receive invitee email changes; new
  action/field labels render human text; tests green; gates pass.

## Out of scope

Writing the events (already done by the slices that perform each action); the CS-3 currency event
itself; exporting history (explicitly out of scope for v1).
