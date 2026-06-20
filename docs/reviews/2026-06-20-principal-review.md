# Principal Engineer Review — PRs merged 2026-06-19 → 2026-06-20

Scope: 13 PRs (#170–#187) merged in the last 24h. Analyzed against the merged
`origin/main` tree, not just the diffs. Focus: system-wide impact, cross-PR
integration bugs, design-pattern consistency, long-term maintainability.

## Merged set, by theme

| Theme | PRs |
|---|---|
| Member invitations (the dominant slice) | #177 MEM-2, #184 EML-2, #185 MEM-3, #183 MEM-4, #187 MEM-6 |
| Email infrastructure | #176 EML-1, #182 EML-3 |
| Personal Circle name sync | #173 (fix #166), #175 USR-2 |
| Platform / hygiene | #170 useValueChange + ADR 0025, #172 mutation-error catalog, #171 drop backfill machinery, #178 categories pagination ties |

The invitation cluster is the risk concentration: five interdependent PRs landed
within ~5 hours of each other, with explicit "until X ships" cross-references.
MEM-4 (#183) merged **last** (05:46), *after* EML-2 (#184, 02:32) had already
switched invitations to automated email — and MEM-4 did not adopt that pattern.
That seam is where the real bugs are.

---

## Critical findings (ranked)

### 🔴 P0 — "Resend invitation" rotates the token but sends no email → it silently breaks the live invite
`packages/convex/convex/invitations.ts:343-360`, UI at `apps/web-app/app/routes/circle/members.tsx:184-211,309-332`

`resendInvitation` does three things: rotates `tokenHash`, refreshes `expiresAt`,
and `return { token }` to the client. It **never enqueues `emailPool` /
`sendInvitationEmail`** — compare `createInvitation` (`invitations.ts:130-138`),
which enqueues and returns nothing. Consequences:

1. The recipient gets **no email** on resend.
2. Rotating `tokenHash` (`:346`) **invalidates the link that was already
   emailed**. So unless the owner notices the copy-link box and manually
   re-shares it, "Resend" leaves the invitee strictly worse off: dead original
   link, no new email.
3. The two flows now contradict each other in the UI — create shows "Invitation
   sent to {email}" with no link (`members.tsx:138-142`); resend shows a
   copy-this-link box. Tests bless both (`members.test.tsx:267-294`), so CI is
   green on a broken UX.

Root cause: MEM-4 was written against MEM-2's original "return plaintext token,
owner copies link" model and merged after EML-2 had already moved create to
server-side email — the resend path never got the same treatment.

**Fix:** make `resendInvitation` enqueue `sendInvitationEmail` exactly like
create, stop returning `token` to the client, and surface "Invitation resent to
{email}". (See idempotency-key note below — required for the fix to actually
deliver.)

### 🟠 P1 — Daily invitation-email rate-limit is bypassable for exactly the heavy senders it targets
`packages/convex/convex/invitations.ts:37-49`

```ts
const recentByUser = await ctx.db
  .query("invitations")
  .withIndex("by_invitedByUserId", (q) => q.eq("invitedByUserId", userId))
  .take(DAILY_INVITATION_EMAIL_CAP + 1); // take(101)
```

`by_invitedByUserId` (`schema.ts:222`) orders by `invitedByUserId` then the
implicit ascending `_creationTime`. `.take(101)` therefore returns the **oldest**
101 invitations by that user. `countRecentInvitationEmails` then counts only rows
inside the 24h window — but for any user with >100 lifetime invitations the recent
ones aren't in the scanned slice, so the count stays near zero and the 100/day cap
**never fires**. The cap is defeated precisely for high-volume senders.

**Fix:** add a time-ordered index (`["invitedByUserId", "createdAt"]`) and range
the 24h window, or `.order("desc")` and stop once `createdAt <= now - DAY_MS`.

### 🟠 P1 — Rate-limit accounting models emails that don't exist (and Resend idempotency key will swallow real ones)
`packages/convex/convex/invitations.ts:20-35,207`

Two coupled problems in the email-accounting model:

- `countRecentInvitationEmails` counts each `resendTimestamps` entry as one sent
  email (`:30-32`). But per the P0 finding, resends send **zero** emails today.
  So the cap over-charges resenders for phantom sends while (per P1 above)
  under-charging creators. The accounting is disconnected from reality in both
  directions.
- Latent, fires the moment P0 is fixed: `sendInvitationEmail` uses Resend
  idempotency key `invite:${invitationId}` (`email.ts:207`), keyed on invitation
  id only. Wiring resend to email would reuse the same key, so Resend's 24h
  dedupe drops the second send — the rotated link never gets delivered. The key
  must incorporate `resendCount` (e.g. `invite:${invitationId}:${resendCount}`),
  and `resendCount` must be threaded into `sendInvitationEmail`. Existing tests
  (`email.test.ts:528-587`) only assert distinctness across *different*
  invitations, so they won't catch it.

---

## Architectural debt

### Circle-entity history is write-only — accumulating with no reader
12 call sites across `circles.ts`, `invitations.ts`, `members.ts` write Circle
history events (`member invited/joined/left`, `invitation resent/revoked`, plus
circle lifecycle). There is **no `listCircleHistory` query and no UI** — only
Transaction and Category history are rendered (`apps/web-app/app/lib/data/history.ts`).
Implications: (a) the human-readable formatting of these new action strings has
never been exercised through a real view, so it's effectively untested; (b) the
`histories` table grows unboundedly on the circle entity with no paginated read
path. Decide deliberately: either land `listCircleHistory` (reusing
`toHistoryEventView`) so the writes have a consumer and a test, or hold the writes
until MEM-7/activity-feed needs them. Right now it's cost with no realized value
and an untested formatting surface.

### `useValueChange` (#170) shipped unused while the anti-pattern it was built to kill is still live
`apps/web-app/app/lib/use-value-change.ts` is correct and well-tested, but it is
imported nowhere outside its own test. Meanwhile `apps/web-app/app/routes/circle/settings.tsx:71-78`
still uses the render-time `useRef`-mutation reset pattern that ADR 0025 and the
hook's own doc-comment explicitly call out as StrictMode/concurrent-unsafe. The
ADR was merged with the codebase contradicting it on day one. Either migrate
`settings.tsx` to `useValueChange` (the intended first consumer) or the ADR is
aspirational, not enforced.

### `acceptInvitation` breaks the file's error convention
`invitations.ts:213-259` throws plain `new Error("Invitation invalid")` in six
branches, while the rest of the module uses `ConvexError(mutationErrorData(...))`.
Convex scrubs non-`ConvexError` messages to "Server Error" in production, so all
coded data is lost across the boundary. The UI happens to be robust (it treats any
accept failure as generic — `invite.tsx:113-114`), so this isn't a live bug, but
it's brittle and inconsistent. ADR 0016's "one generic signal" intent is better
served by a single dedicated coded error than by raw `Error` throws.

---

## Lower-severity / cleanups

- **Stale resend link** persists in `PendingInvitationsList` across revoke and
  live-query refresh (`members.tsx:157-159,247`) — `resendLinkById[id]` is never
  cleared on revoke or when the row leaves the list. Foot-gun once P0 is reworked.
- **Welcome email silent loss** when `RESEND_API_KEY`/`RESEND_FROM_EMAIL` is
  unset: `sendEmail` returns `false` (no throw) → Workpool records success → no
  retry, no `onComplete` failure log, `welcomeSentAt` stays unset forever
  (`email.ts:85-88,145-147`). Intended degrade (avoids retry-storm) but invisible
  in prod. Add a config alarm / Sentry breadcrumb on the env-unset branch.
- **`createInvitation` duplicate check** `.collect()`s every invite for the
  circle+email pair (`invitations.ts:93-98`), including all historical
  accepted/revoked rows — unbounded over the table's life. Range on status or cap.

## What was solid
- EML-3 send-then-mark welcome flow: enqueue is transactional with user creation
  (`auth.ts`), `markWelcomed` is idempotent, and the 24h Resend dedupe safely
  covers the non-atomic check→send→mark window (Workpool retries exhaust in ~7.5
  min, well inside 24h). No double-delivery in practice.
- Personal Circle name reconcile (#173/#175): correctly gated on
  `personalNameCustomizedAt` (`model.ts:99-126`), all mutations are single
  serialized transactions, toggle derives state from server truth with no
  optimistic local state. No race found.
- #172 derives the mutation-error enum from the catalog — genuinely closes the
  drift hazard it claims to. #171 backfill removal and #178 pagination-tie fix are
  clean and well-scoped.

## Recommended action order
1. Fix P0 resend (enqueue email + idempotency key with `resendCount` + stop
   returning token to client) — one change, closes the worst bug and its latent twin.
2. Fix the daily-cap index/range bypass.
3. Decide circle-history reader-vs-hold; migrate `settings.tsx` to `useValueChange`.
4. Normalize `acceptInvitation` onto a coded `ConvexError`; clear stale resend
   links; add welcome-email env alarm.
