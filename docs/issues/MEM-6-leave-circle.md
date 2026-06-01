# MEM-6 · Leave Circle

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:membership`, `backend`, `ui` |
| **Depends on** | MEM-1 |
| **PRD stories** | 18 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Member, Removed Member, Personal Circle, Owner |

## Intent

A Member can remove themselves from a regular Circle (PRD 18). Leaving is the self-service
twin of MEM-5: same frozen-identity, same status-flip-not-delete, same rejoin reconnection.
Two structural guards: a **Personal Circle cannot be left** (always solo, glossary), and **the
Owner cannot leave** without transferring ownership first (MEM-7) — otherwise the Circle is
orphaned (PRD 19's rationale).

## Implement

- **Convex** (`members.ts`):
  - `leaveCircle` mutation: args `{ circleId }`. `requireCircleAccess` → reject if Personal
    Circle → reject if caller `isOwner` (must transfer first) → flip own membership
    `status:"removed"`, set `removedAt`, leave identity frozen → `recordEvent(circleEntity,
    action:"member left", changes:[{field:"member", from:<display name>}], actor: self)`.
  - After leaving, the Circle drops out of the caller's `listMyCircles`; the live guard
    revokes their access reactively (ADR 0017).
- **Web:** a "leave Circle" action (hidden on Personal; for the Owner, surfaced as "transfer
  ownership first"). On success, navigate to the safe fallback route.

## Why this way

- **Owner-can't-leave** mirrors the single-Owner invariant; force MEM-7 first.
- **Reactive revocation:** because access is a live query, leaving immediately read-only/
  redirects the leaver — assert this is the live behavior, not a reload-only effect.

## How to test

- **Happy:** non-owner Member leaves → own row removed, frozen identity, event recorded;
  `listMyCircles` no longer includes it; access query now returns inaccessible.
- **Guards:** Owner leaves ✗ (transfer first); Personal Circle leave ✗.
- **Rejoin:** after leaving, MEM-3 rejoin reactivates the same row (cross-check).
- **Live revocation:** after leave, a subscribed access query flips to inaccessible without a
  fresh sign-in.
- **History:** left event records self as actor + affected Member by name.

## Done when

- A non-owner Member can leave a regular Circle (not Personal; Owner must transfer first) with
  frozen identity, live revocation, and audit; tests green; gates pass.

## Out of scope

Owner removal of others (MEM-5); transfer (MEM-7).
</content>
