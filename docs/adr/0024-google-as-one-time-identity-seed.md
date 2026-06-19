# Google is a one-time identity seed; Spend Circle owns the profile

At first sign-in (the Better Auth `onCreate` trigger) Spend Circle seeds a User's
`displayName`, `image`, and `email` from Google. Afterward Google no longer
overwrites `displayName` or `image` — the User owns them in Spend Circle (Display
Name is editable in-app; Profile Picture becomes editable when uploads land) —
while `email` stays synced with Google because it is identity- and
delivery-critical. We chose this over mirroring the full Google profile on every
sign-in so that user edits are never clobbered and users manage their identity in
our app rather than in Google, removing that round-trip friction.

## Consequences

- The Better Auth `user.onUpdate` trigger is reduced to syncing `email` only; it
  no longer propagates `displayName`/`image`.
- Amends ADR 0018: materialized member-identity propagation (refresh ACTIVE
  memberships, leave Removed Members frozen) is now triggered by the in-app
  `updateProfile` mutation, not the auth trigger.
- `displayName`/`image` may drift from the live Google profile by design; this is
  accepted (almost nobody changes their Google name, and the app value is now the
  owned one).
- Security: invitation acceptance matches the **live** Google session email
  (`authUser.email`), not a stored snapshot, so a changed Google email cannot be
  exploited through a stale copy.
- The Personal Circle name is seeded from the Google first name at creation and reconciled to the
  User's Display Name whenever they confirm or edit it in Onboarding or App Settings via a direct
  patch (no Circle History event — identity-driven, not a deliberate Circle rename). Its Mark is derived
  from the name via the shared `initials` helper, like a regular Circle, instead of the former hardcoded
  `"P"`. Fallback when no usable first token: **Personal Circle** (mark `"PC"`).
