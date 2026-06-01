# NTF-1 · Notification Center

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:notifications`, `backend`, `ui` |
| **Depends on** | F0 |
| **Unlocks** | NTF-2 |
| **PRD stories** | 81, 82, 83 |
| **ADRs** | 0015, 0016, 0017, 0018 |
| **Glossary** | Notification Center |

## Intent

The in-app, **user-specific** notification list (glossary). Notifications belong to one User,
have per-User **unread/read** state (PRD 82), can be marked read individually or all-at-once,
and **cannot be deleted** in v1. They **link to the relevant object only when the User still has
access**; otherwise they show **text only**, and archived objects open in their **archived
context** (PRD 83). This slice builds the read/center surface + read-state mutations; the events
that *create* notifications are NTF-2.

## Implement

- **Convex** new `packages/convex/convex/notifications.ts`:
  - `listNotifications` query: `requireCurrentUser` → notifications `by_user` newest-first →
    for each, **resolve link accessibility at read time**: if the linked object is still
    accessible to this User, include the canonical link; else drop the link (text only). Use the
    same access resolution as the guards (anti-enumeration — never reveal an inaccessible object).
  - `markNotificationRead` / `markAllRead` mutations: `requireCurrentUser` → flip `read` on the
    User's own notification(s) only.
  - `getUnreadCount` query for the badge.
- **Web:** Notification Center UI (bell + count + list), mark-read interactions, links that
  navigate to the object (Circle/Transaction/Category) when present, text-only otherwise.
  Derive view types; fixtures + hooks.

## Why this way

- **Accessibility resolved at read time, not stored**: access can change (Member removed, Circle
  archived), so the link must be re-checked on each read — consistent with the resolution
  primitive and anti-enumeration (ADR 0016).
- **No delete** — only read-state changes (glossary).
- **Own-notifications-only** at the server (a User can't read/mark another's).

## How to test

- **Read state:** mark one read; mark all read; unread count updates; can't mark another User's.
- **Link resolution:** notification for an accessible object includes the canonical link;
  after the User loses access (removed/circle archived for non-members), the same notification
  renders text-only on next read; archived-but-accessible object links to its archived context.
- **Ownership:** a User sees only their own notifications.
- **Order:** newest-first.
- **Mock parity:** center renders in mock mode from fixtures.

## Done when

- A User sees their own notifications newest-first with live read/unread state and
  access-resolved links (text-only when inaccessible, archived-context when archived); no
  deletion; tests green; gates pass.

## Out of scope

Creating notifications on events (NTF-2); emails (EML-*).
</content>
