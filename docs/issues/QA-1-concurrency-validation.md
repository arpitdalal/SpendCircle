# QA-1 · Concurrent-modification e2e validation

| | |
|---|---|
| **Status** | Todo |
| **Depends on** | TXN-2, TXN-3, MEM-1, MEM-5 |
| **Unlocks** | — (terminal; the home for future concurrency/stale-write e2e scenarios) |
| **PRD stories** | Live read-only / revocation promise (same basis as the §5.7 live-update bar) |
| **ADRs** | 0015, 0016, 0018, 0019 |
| **Glossary** | Transaction, Recorded By, Paid By, Archive, Owner, Member, Removed Member |

## Intent

Real test users edit the same Circle at the same time, so v1 must degrade **gracefully** under
concurrent modification — never corrupt a row, never silently drop a write, never leave a stale
form that "succeeds" against deleted/archived state. The per-slice tests already assert
invariants for a *single* actor (§5.5); this slice proves the contract holds when **two real
sessions interleave on the same Transaction**, using the real self-hosted backend that ADR 0019
makes the E2E surface (mock-mode could never race two sessions over one row).

It is deliberately the **last** validation slice, like NTF-2 — and it is the standing home for
concurrency/stale-write scenarios. It ships seeded with the canonical case (Owner archives a
Transaction while its Recorded By is mid-edit); future races (two Members editing distinct
fields, Currency-lock race, Category archive vs. attach, **Paid By target removed mid-edit**) are
appended here as their features land.

## Implement

- **E2E** (`e2e/transactions-concurrency.spec.ts`): drive **two** Playwright browser contexts,
  each a real backend-trusted session via the `E2E_TEST_AUTH` email/password bypass (ADR 0019) —
  session **A = Recorded By Member**, session **B = Owner** of the same Circle.
- **Seed** (extend the E2E seed helpers per ADR 0019's "seed what the feature needs"): a Circle
  with an Owner + a second Member, ≥1 active Category, and one `active` Transaction **recorded by
  the Member**.
- **Scenario (deterministic interleaving, not a simultaneous race):**
  1. Session A opens that Transaction's edit form and changes a field (don't submit yet).
  2. Session B archives the Transaction; **await** completion.
  3. Assert A's live-revocation: A's reactive view of the Transaction flips to archived without a
     reload (ADR 0018).
  4. Session A submits the now-stale edit → assert the server rejects it (`assertWritable` /
     archived guard, ADR 0015), A sees the generic unavailable/archived message and is navigated
     to the fallback (ADR 0016), and the Transaction's persisted state is exactly B's archive —
     A's edited fields did **not** apply.
- **No new app code is expected.** If a step exposes a gap (e.g. the edit form swallows the
  rejection or applies a stale write), that is a bug fixed at its owning slice (TXN-2 / TXN-3)
  with a regression test — not patched or skipped here.

### Appended scenario — Paid By target removed mid-edit (needs MEM-5)

A second interleaving on the same form surface, added once **MEM-5 (Remove Member)** ships (hence
the dependency): session **A = Recorded By** opens the edit form and **selects another current
Member as Paid By**; session **B = Owner** then **removes that Member** from the Circle and A
submits. The hazard is a *stale selection* (not stale-archived state): A's chosen Paid By no longer
resolves to a current Member.

- **Shipped behavior to lock in (TXN-2):** the form must **block the save with an accessible
  message** ("the selected payer is no longer a member… pick a current member") rather than
  silently dropping the change — leaving Paid By unchanged on edit, or defaulting back to self on
  create. This mirrors the keep-existing / block-newly-added asymmetry of the archived-Category
  guard ([QA-2](QA-2-archived-category-mid-creation.md)): **keeping** the Transaction's existing
  (now-Removed) Paid By stays an allowed no-op; **newly picking** a Member who is then removed is
  blocked. Server stays the authority — `updateTransaction` / `createTransaction` reject a Removed
  Member as Paid By (`requireCurrentMember`, ADR 0015) as the backstop.
- A component test already covers the client block by mutating the doubled `listMembers` mid-form
  ([transactions.test.tsx](../../apps/web-app/app/routes/circle/transactions.test.tsx)); this slice
  adds the **real-backend, two-context** proof — only achievable once MEM-5 can drive the live
  removal — that the reactive `listMembers` flip reaches the open form and the block holds end to
  end.

## Why this way

- **Deterministic interleaving over `Promise.all` simultaneity.** A literal "fire both at once"
  race is non-deterministic and flaky in CI; sequencing A-opens → B-archives → A-submits
  exercises the exact hazard (a stale write over revoked/archived state) reliably.
- **E2E is the only layer that proves the *user-facing* outcome.** A convex-test could assert the
  mutation rejection in isolation, but only the real browser-to-backend path proves the live
  revocation, the message, and the navigation a real Member actually experiences — the corner
  most likely cut.
- **Anti-enumeration parity holds here too (ADR 0016):** the message A sees must not reveal
  archived-vs-deleted-vs-access-revoked; same observable outcome.

## How to test

This slice **is** the test; its assertions:

- **Live revocation** — after B archives, A's open Transaction view reflects archived with no
  reload (reactive query, ADR 0018).
- **Stale write rejected** — A's pre-archive submit throws server-side (archived / not writable);
  nothing persists from A.
- **Graceful UI** — A gets the generic unavailable-link/archived message (`role="alert"`) and is
  navigated to the fallback surface; no stuck or silently-failed form (ties to the §4 "no silent
  failures" convention).
- **No corruption / no partial write** — final Transaction state equals B's archive exactly; A's
  edited fields are absent.
- **Anti-enumeration** — the message does not disclose the precise reason (ADR 0016).

## Done when

The `transactions-concurrency` e2e spec is green against the self-hosted Convex backend; the
archive-vs-edit interleaving asserts live revocation + graceful stale-write rejection + no
corruption; any defect it surfaces is fixed at its owning slice with a regression test; gates pass.

## Out of scope

The edit and archive features themselves (TXN-2, TXN-3 own them). Optimistic-concurrency
version tokens / last-write-wins reconciliation (not a v1 mechanism unless a defect here demands
it). Non-Transaction concurrency scenarios — added to this slice incrementally as their features
ship, not built up front.
