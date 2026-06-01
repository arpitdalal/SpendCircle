# CAT-3 · Inline Category create in Transaction form

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:categories`, `ui` |
| **Depends on** | CAT-1, TXN-1 |
| **Unlocks** | — |
| **PRD stories** | 53 |
| **ADRs** | 0003, 0015 |
| **Glossary** | Category |

## Intent

Entry must not be interrupted: a Member adding a Transaction who needs a Category that
doesn't exist yet should create it **without leaving the form** (PRD 53). This is a UI
composition slice — it reuses CAT-1's `createCategory` mutation; it does not introduce a new
backend path. The newly created Category must immediately become selectable and selected in
the open form, with the form's current Transaction type pinning the new Category's type
(Expense form ⇒ Expense Category).

## Implement

- **Web only.** In the Transaction form (from TXN-1), add an inline "create category"
  affordance inside the Category multi-select: typing a non-existent name offers "Create
  <name>" which opens a minimal inline create (name prefilled, type = form's current type,
  color auto-picked from palette with option to change), calls `api.categories.createCategory`,
  and on success adds the returned Category to the selection.
- Reactivity: because `useCategories` is a live `useQuery`, the new Category appears in the
  list automatically; ensure the just-created one is auto-selected.
- Surface the server's uniqueness error inline (e.g. user types an existing name) and offer
  to select the existing one instead.

## Why this way

- No new mutation — reuse `createCategory` so all CAT-1 invariants (uniqueness, color, type,
  permissions, history) hold for free. Duplicating the create logic in the UI would be the
  drift this architecture avoids.
- Type is pinned by the form, not chosen, so an inline Category can never be created for the
  wrong type (PRD 48).

## How to test

- **Component/integration:** inline-create adds a Category and auto-selects it; the form's
  current type is applied to the new Category; switching the form type before inline-create
  uses the new type.
- **Error path:** inline-creating a name that already exists (active or archived) shows the
  uniqueness error and offers the existing active Category; no duplicate created.
- **Permissions:** inline create against an archived Circle is blocked (server) and the UI
  reflects read-only.
- **E2E:** add a Transaction, inline-create a Category, save — Transaction persists with the
  new Category attached.

## Done when

- A Member can create-and-select a Category without leaving the Transaction form, type is
  pinned, uniqueness errors handled, reusing `createCategory`; tests green; gates pass.

## Out of scope

Any change to the create mutation itself (that's CAT-1).
</content>
