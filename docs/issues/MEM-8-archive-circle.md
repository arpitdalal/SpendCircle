# MEM-8 · Archive / Restore Circle

| | |
|---|---|
| **Status** | Done |
| **Labels** | `area:circles`, `area:membership`, `backend`, `ui` |
| **Depends on** | MEM-4 (merged — `revokeInvitation` lives in `invitations.ts`) |
| **PRD stories** | 20, 21, 22, 26 |
| **ADRs** | 0015, 0016, 0018 |
| **Glossary** | Archived Circle, Owner |

## Intent

An Owner archives a finished regular Circle so it stops cluttering active views (PRD 20).
Archiving makes the Circle **read-only** for everyone — current Members can still view and
search history but cannot add/edit/delete Transactions, Categories, or membership (PRD 21) —
and the read-only state must apply **live** (a Member viewing it when it's archived is moved to
the read-only archived view — PRD 26). Archiving also **revokes pending Invitations and
invalidates their links** (PRD 22). A Personal Circle cannot be archived (glossary).

The read-only enforcement already exists structurally: `assertWritable()` throws on a
non-active Circle, every mutation already calls it, and 8 of the 9 Circle routes already gate
their write CTAs on `circle.status === "active"`. **This slice is narrow:** add the two
mutations that flip status (and cascade invite revocation), add the Owner-facing archive/restore
*action* (the read-only shell it drops into already exists), and prove the read-only rule with
tests where they're currently missing.

## Current state — what already exists (read before implementing)

- **Backend read-only rule:** `AuthorizedCircle.assertWritable()` throws coded
  `ConvexError(circleArchived)` when `circle.status !== "active"`
  ([`guard.ts:103`](../../packages/convex/convex/guard.ts)). Every mutating handler already calls
  it (see `circles.ts`, `categories.ts`, `transactions.ts`, `members.ts`, `invitations.ts`).
- **Schema:** `circles.status` is `"active" | "archived"` and `circles.archivedAt` is
  `v.optional(v.number())` — both already defined
  ([`schema.ts:57,64`](../../packages/convex/convex/schema.ts)). There is also a
  `by_owner_and_status` index ready for an archived-Circles listing.
- **The mirror pattern to copy:** `archiveCategory` / `restoreCategory`
  ([`categories.ts:456-530`](../../packages/convex/convex/categories.ts)) is the exact shape to
  replicate at Circle scope — patch `status` + set/clear `archivedAt`, reject the redundant
  transition (no silent no-op, README §4), and `recordEvent` an `"archived"` / `"restored"`
  event with empty `changes`.
- **Web read-only shell:** these routes already render their read-only state off the live
  `circle.status` (no new wiring needed): `transactions.tsx`, `transaction-new.tsx`,
  `transaction-edit.tsx`, `transaction-detail.tsx`, `categories.tsx`, `category-new.tsx`,
  `members.tsx`, `search.tsx`. Several already show *"This circle is archived. Restore it to …"*
  copy — but the Restore action does not exist yet (this slice adds it). The Circle shell
  ([`layouts/circle-layout.tsx`](../../apps/web-app/app/routes/layouts/circle-layout.tsx)) feeds
  every tab the live `circle` from the reactive `getCircle` query, so the read-only flip is free.
- **The gap:** `routes/circle/settings.tsx` does **not** gate on archived status and is the
  natural home for the archive/restore action.

## Implement

### Convex (`circles.ts`)

- **`archiveCircle`** mutation — copy the `archiveCategory` shape:
  - `requireCircleAccess` → reject non-Owner → reject `kind === "personal"` → reject an
    already-archived Circle (`circle.status !== "active"` ⇒ throw, no silent no-op).
  - Patch `{ status: "archived", archivedAt: Date.now() }`.
  - **Revoke pending Invitations inline.** Do **not** call `revokeInvitation` — it is a public
    mutation that itself owner-checks and `assertWritable()`s (and Convex can't call a mutation
    from a mutation). Query the Circle's invitations (`by_circle`), and for each with
    `status === "pending"` patch `{ status: "revoked" }` — the same transition `revokeInvitation`
    performs at [`invitations.ts:443`](../../packages/convex/convex/invitations.ts). If a shared
    helper is warranted, factor one in `invitations.ts` and call it from both sites rather than
    duplicating the loop.
  - `recordEvent` one `"archived"` Circle event (the moderator as actor, empty `changes`).
    **Decision:** record a single lifecycle event, not one per revoked invite — match
    `archiveCategory`'s "the flip is the event" convention; per-invite noise is out of scope.
- **`restoreCircle`** mutation — mirror `restoreCategory`:
  - `requireCircleAccess` → Owner-only → reject a non-archived Circle → patch
    `{ status: "active" }` and **clear `archivedAt`** (set to `undefined`) → `recordEvent`
    `"restored"`.
  - Restore does **not** un-revoke Invitations — they stay `revoked`; the Owner re-invites.
- **No new guards.** Every other mutation's `assertWritable()` already enforces read-only;
  this slice proves it with tests (see below), it does not add new checks.

> Note: `acceptInvitation` already rejects when `circle.status !== "active"`
> ([`invitations.ts:262`](../../packages/convex/convex/invitations.ts)), so an archived Circle
> can't be joined even without the revoke. The revoke is belt-and-suspenders + list hygiene
> (the pending invite disappears from the Owner's view and the emailed link reads as revoked).

### Web

- **Archive/Restore action (new):** Owner-only control in `routes/circle/settings.tsx`. Show
  **Archive** when `circle.status === "active"`, **Restore** when `"archived"`. Wire through a
  `useArchiveCircle` / `useRestoreCircle` seam in `lib/data/circles.ts` (mirror the existing
  `useRenameCircle` etc.). Archiving is reversible but disruptive — gate it behind a confirm
  step. Surface the coded `circleArchived` rejection inline like the other Circle forms.
- **Gate the settings route itself:** when `circle.status === "archived"`, the rename/color/
  setup forms must go read-only (mirror the `const writable = circle.status === "active"`
  pattern the other routes use), leaving only the Restore action live.
- **Live flip:** comes free — settings and every tab read the reactive `circle`, so an archive
  performed elsewhere (or by another Owner) flips this Member's view without reload. Verify, do
  not re-wire.
- **Active-views decision (PRD 20):** `listMyCircles` currently returns archived Circles too
  (it filters on active *membership*, not Circle status). Decide how archived Circles surface so
  they "stop cluttering active views" without becoming unreachable (history must stay viewable).
  Recommended: keep them in `listMyCircles` but group/deprioritize them in the circle switcher
  (a separate "Archived" section), rather than dropping them — a member still needs to open one
  to read history. Confirm the chosen approach against the switcher
  (`components/circle-switcher.tsx`) and home (`routes/home.tsx`).

## Why this way

- **Read-only is already enforced by `assertWritable()`** in every mutation and by the
  per-route `writable` gates — this slice proves it with tests rather than re-implementing
  guards, and reuses the `archiveCategory`/`restoreCategory` lifecycle shape verbatim.
- **Live read-only** comes free from the reactive `getCircle` query that the Circle shell
  already feeds to every tab; the UI keys read-only off the live `circle.status`, not a
  one-time load.
- **Archive revokes invites** so an archived Circle can't be joined (PRD 22); restore leaves
  them revoked (no silent reactivation of stale links).

## How to test

- **Permissions:** Owner archives/restores ✓; non-owner ✗; Personal Circle ✗; archiving an
  already-archived Circle ✗; restoring an active Circle ✗.
- **Read-only cascade:** against an archived Circle, assert every mutation type is rejected with
  the coded `circleArchived` error — `createTransaction`, `updateTransaction`,
  `archiveTransaction`/`restoreTransaction`, `createCategory`, `updateCategory`,
  `archiveCategory`, `renameCircle`, `updateCircleSettings`, `completeCircleSetup`,
  `createInvitation`, `resendInvitation`, `revokeInvitation`, `removeMember`,
  `transferOwnership` — all ✗; reads (ledger, search, history) ✓.
  - **Already covered** (don't duplicate, extend if needed): `transactions.test.ts`,
    `categories.test.ts`, and `invitations.test.ts` already patch a Circle to archived and assert
    rejection.
  - **New coverage needed:** `circles.test.ts` and `members.test.ts` have **no** archived-Circle
    rejection tests today — add them for the circle/member mutations and for `archiveCircle`/
    `restoreCircle` themselves. `guard.test.ts` already proves `assertWritable` throws on an
    archived Circle.
- **Invite revocation:** pending invites become `revoked` on archive; a non-pending invite
  (accepted/expired/already-revoked) is left untouched; accepting a pre-archive link ✗ (generic
  invalid); restore does **not** un-revoke.
- **Live:** a subscribed `getCircle` query flips to archived/read-only after archive without
  reload (web test driving the reactive seam).
- **History:** archive records an `"archived"` Circle event and restore a `"restored"` one
  (moderator as actor, empty `changes`); the invite revokes do not each emit an event.

## Done when

- Owner can archive/restore a regular Circle (Personal rejected, redundant transitions
  rejected); archived ⇒ fully read-only (proven across all mutation types, including the
  circles/members gaps) and live; pending invites revoked on archive and left revoked on
  restore; `archivedAt` set on archive and cleared on restore; archived Circles no longer
  clutter active views yet stay reachable for history; tests green; gates pass.

## Out of scope

Deleting an empty Circle (MEM-9); Transaction lifecycle filters (RPT-2); a per-invite history
event for each revoke.
