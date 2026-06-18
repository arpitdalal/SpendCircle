# CS-5 · Enforce Circle Setup (completion flag + route gate, remove Skip)

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | CS-1, CS-2 (PR #153 must merge first) |
| **PRD stories** | 11 |
| **ADRs** | 0015, 0016, 0017, 0023 |
| **Glossary** | Circle Setup, Setup answers |

## Intent

Today Circle Setup is **optional and skippable**, and "setup completed" is *inferred* from
`circles.setupAnswers !== undefined` — a lossy signal that collapses four distinct states
(Finished, Skipped, never-reached, Personal Circle) into one. That inference is the root cause
of the CS-2 bug ([PR #153 review](https://github.com/arpitdalal/SpendCircle/pull/153#discussion_r3431471099)):
`updateCircleSettings` writing `setupAnswers` flips `undefined → defined` **without** running
`completeCircleSetup`, permanently locking out the one-shot starter-Category seeding.

This slice makes setup **mandatory** for regular Circles and tracks completion **explicitly**:

- Add a dedicated `setupCompletedAt` completion flag (separate from the answer *data*).
- **Remove the Skip option.** A single **Finish** button: default answers (none chosen) seed
  the 9 default starter Categories; specific answers work as they do today. No owner ever leaves
  setup with zero Categories.
- **Gate every Circle-scoped route**: an incomplete regular Circle redirects to `/setup`.
- The Personal Circle has no setup concept — it is born complete and is never gated.

> **Why a flag, not the inferred signal.** "Did the owner pass the setup step" (a workflow
> milestone) and "what did the owner answer" (domain data CS-2 lets them re-edit) are two
> different facts. Overloading the data's *presence* to mean *completion* is exactly the
> conflation that produced the bug. The flag separates them; `setupAnswers` goes back to being
> pure data.

## Implement

### Backend (`packages/convex/convex`)

- **Schema** (`schema.ts`): add required `setupCompletedAt: v.union(v.number(), v.null())` to
  `circles`. `null` means incomplete; a number means complete. Existing rows must be backfilled
  before this lands.
- **Bootstrap** (`model.ts`): the Personal Circle insert sets `setupCompletedAt: now` — Personal
  Circles are complete by definition and never visit `/setup`.
- **`createCircle`** (`circles.ts`): a regular Circle sets `setupCompletedAt: null` — the
  owner must Finish setup. (No other change.)
- **`completeCircleSetup`** (`circles.ts`): set `setupCompletedAt: now` in the patch, and change
  the "already complete" guard to check `access.circle.setupCompletedAt !== null` (was
  `setupAnswers !== undefined`). Starter seeding and the `setup_completed` history event are
  unchanged (CS-1). The default path (`answers = {}`) still seeds the 9 shared starters
  (`starterCategories({})`).
- **`updateCircleSettings`** (`circles.ts`): **re-home the interim guard** added in PR #153.
  Replace "reject `setupAnswers` when `circle.setupAnswers === undefined`" with "reject
  `setupAnswers` edits unless `circle.setupCompletedAt !== null`." This keeps the one-shot
  invariant *and* correctly allows post-setup answer edits (the original presence-based guard was
  only correct for the pre-flag model). `color` edits remain allowed regardless.
- **`toCircleView`** (`circles.ts`): expose a derived `setupComplete: circle.setupCompletedAt !== null`
  on the client view (keep `setupAnswers` for the settings form). The route gate reads this.
- **Backfill** (`maintenance.ts`): an operator-key-guarded, paginated mutation
  (`backfillCircleSetupCompleted`) that sets `setupCompletedAt` on every existing Circle before
  making the field required — **grandfather all existing Circles as complete** so the new gate
  applies only to Circles created from here on. Without this, any already-skipped Circle (and its
  Members) is trapped on `/setup`. Follow the `backfillTransactionSearchText` pattern (bounded
  page + cursor + operator key).

### Web (`apps/web-app/app`)

- **Setup route** (`routes/circle/setup.tsx`): **remove the Skip button and its `onSkip`/`finish`
  skip path.** Keep only **Finish** → `completeCircleSetup`. Submitting with the default
  "Not sure yet" purpose sends `{}` and seeds the 9 default starters (already how Finish behaves).
  Keep the existing `setupAnswers !== undefined`→dashboard redirect *or* switch it to
  `circle.setupComplete` (equivalent post-flag). Defensive owner check: a non-owner who somehow
  lands here redirects to the Circle dashboard (the server already rejects their
  `completeCircleSetup` call; this avoids showing a form that errors on submit).
- **Route gate** (`routes/layouts/circle-layout.tsx`): when `!circle.setupComplete`, redirect to
  the Circle's `/setup` route — **except when already on `/setup`** (guard against a redirect
  loop; compare `useLocation().pathname` to the setup path). Personal Circles pass automatically
  (flag set at bootstrap). Because the gate sits above every Circle child route, an owner cannot
  reach `/members` to invite anyone until they Finish — so by construction no non-owner ever
  joins an incomplete Circle or sees `/setup`.

## Why this way

- **Server-enforced, not just routed.** The redirect is client-side UX; `updateCircleSettings`
  and `completeCircleSetup` are directly callable mutations, so the one-shot invariant is enforced
  at the mutation boundary (ADR 0015). The gate is the courtesy layer on top.
- **Flag over inference** — see the Intent callout. Completion is a workflow fact; answers are
  data. Keeping them separate is what dissolves the bug rather than papering over it.
- **No empty Circles.** Removing Skip and always seeding defaults means every regular Circle has a
  usable Category set the moment setup finishes — recording an expense needs no manual Category
  first.
- **Grandfather, don't trap.** Existing Circles predate the gate; backfilling them complete keeps
  current Members unaffected.

## How to test

- **Gate:** a freshly created regular Circle redirects every Circle-scoped route to `/setup`;
  after Finish, routes render normally. The `/setup` route itself never redirects to itself
  (no loop). The Personal Circle is never redirected.
- **Remove Skip:** the setup form has only Finish; submitting with no purpose seeds the 9 default
  starters and marks `setupCompletedAt`; specific/residence answers add their extra starter
  (Rent/Mortgage) as today.
- **Completion flag:** `completeCircleSetup` sets `setupCompletedAt` and rejects a second run;
  Personal Circle has `setupCompletedAt` from bootstrap.
- **Mutation invariant (direct call):** calling `updateCircleSettings` with `setupAnswers` on an
  incomplete Circle is rejected server-side; on a complete Circle it succeeds (answers editable in
  CS-2 settings). `color` edits succeed in both states.
- **Backfill:** existing Circles become complete after the
  backfill runs to `isDone`; their Members are not redirected to `/setup`.

## Done when

- Regular Circles must complete setup before any Circle-scoped route is usable; the Personal Circle
  is exempt; Skip is gone and every finished Circle has starter Categories; completion is tracked by
  `setupCompletedAt`; `updateCircleSettings`/`completeCircleSetup` enforce the one-shot at the
  mutation boundary; existing Circles are grandfathered; tests green; gates pass.

## Out of scope

The Color / Setup-answer editing surface itself (CS-2), starter-Category derivation (CS-1), Circle
History view (CS-4). This slice changes *when* setup happens and *how completion is tracked*, not
*what* setup writes.
