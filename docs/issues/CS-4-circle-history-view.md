# CS-4 · Circle History view

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | CS-0 (consumes events from CS-2, CS-3, MEM-*) |
| **PRD stories** | 79, 80 |
| **ADRs** | 0016, 0018 |
| **Glossary** | Circle History |

## Intent

The read surface over a Circle's audit (PRD 79): ownership transfers, Members added/removed,
Circle archived/restored, and Circle Settings changes (name, Color, Currency, Setup answers),
showing old/new values and actor + affected Member — with **no raw internal IDs** (PRD 80).
The events themselves are written by F0 (create/rename), CS-2, CS-3, and the MEM-* slices via
`recordEvent`; this slice surfaces them. Any current Member can view Circle History.

## Implement

- **Convex** (`circles.ts`): `listCircleHistory` query → `resolveCircleAccess` → `null` if no
  access → `listEntityHistory(ctx, circleEntity(circleId))`. (Membership/ownership events from
  MEM-* must record `actorMemberId` + the affected Member's display name in `changes` — note
  this contract in the MEM slices.)
- **Web:** Circle History panel (reuse the shared `HistoryList` from CAT-2) on a Circle
  Settings/History surface, available to all current Members, newest-first.

## Why this way

- Pure read reusing `listEntityHistory`; all formatting/freezing already done at write time.
- Membership/ownership events carry the affected Member's **frozen display name** in
  `changes` (not an id), satisfying PRD 80 — verify the MEM slices follow this when they land.

## How to test

- **Access:** any current Member can read ✓; non-member → `null`; archived Circle still
  readable by current Members (history is view-only, not a write).
- **Content:** after a rename, color change, currency change, ownership transfer, member
  add/remove, archive/restore — each appears with correct action, actor, affected Member by
  name, and old/new values; **assert no raw `Id` strings** in rendered output.
- **Order:** newest-first.

## Done when

- Current Members can view a complete, ID-free Circle History reflecting settings, membership,
  ownership, and lifecycle events, newest-first; tests green; gates pass.

## Out of scope

Writing the events (done by the slices that perform each action); exporting history
(explicitly out of scope for v1).
</content>
