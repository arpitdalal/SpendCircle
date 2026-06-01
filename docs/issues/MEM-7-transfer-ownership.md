# MEM-7 · Transfer ownership

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui` |
| **Depends on** | MEM-1 |
| **PRD stories** | 19 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Owner, Member |

## Intent

A Circle has **exactly one Owner** (glossary). To leave without orphaning the Circle, the Owner
transfers ownership to another current Member (PRD 19). This is the only way the `owner` role
moves. After transfer the old Owner becomes a regular Member (and may then leave via MEM-6).
Must be atomic — the Circle must never have zero or two Owners.

## Implement

- **Convex** (`members.ts`):
  - `transferOwnership` mutation: args `{ circleId, toMemberId }`. `requireCircleAccess` →
    current caller `isOwner` only → `assertWritable()` → reject Personal Circle → assert target
    is a **current active Member** of this Circle and not already Owner → in one mutation: set
    target `role:"owner"`, set caller `role:"member"`, and update `circles.ownerUserId` to the
    target's userId (keep the denormalized owner pointer consistent) → `recordEvent(circleEntity,
    action:"ownership transferred", changes:[{field:"owner", from:<old owner name>, to:<new
    owner name>}])`.
- **Web:** Owner-only "transfer ownership" picking a current Member, with confirmation.

## Why this way

- **Single-Owner invariant** is the whole point — do all role changes + the `ownerUserId`
  update in one handler so there's never an intermediate ownerless/two-owner state.
- **`circles.ownerUserId` stays consistent** with the `owner`-role member row (both are read in
  different places: guard derives `isOwner` from the member role; `listMyCircles`/personal
  bootstrap use `ownerUserId`). Keep them in lockstep.

## How to test

- **Happy:** Owner transfers to a current Member → exactly one Owner (the target), old Owner is
  now `member`, `ownerUserId` updated; event recorded.
- **Invariant:** assert never two Owners / zero Owners at any observable point.
- **Permissions:** non-owner transfers ✗; target not a current Member ✗; target is a Removed
  Member ✗; transfer to self ✗; Personal Circle ✗; archived Circle ✗.
- **Follow-on:** after transfer the old Owner can leave (MEM-6) ✓; the new Owner has Owner
  powers (e.g. can invite) ✓.
- **History:** records old→new owner by name, no raw IDs.

## Done when

- Owner can atomically transfer to a current Member, preserving the single-Owner invariant and
  `ownerUserId` consistency; audited; tests green; gates pass.

## Out of scope

Leaving (MEM-6); removing members (MEM-5).
</content>
