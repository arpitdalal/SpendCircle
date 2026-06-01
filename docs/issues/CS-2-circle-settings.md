# CS-2 · Circle Settings: Color, Mark, Setup answers

| | |
|---|---|
| **Status** | Todo |
| **Labels** | `area:circles`, `backend`, `ui` |
| **Depends on** | CS-0 |
| **PRD stories** | 11 |
| **ADRs** | 0015, 0018 |
| **Glossary** | Circle Color, Circle Mark, Circle Settings |

## Intent

**Circle Settings are Owner-controlled** (glossary). The Owner can change Circle Color
(which re-derives the Circle Mark's color) and re-edit Setup answers. Members cannot change
settings, but Members can still create non-colliding Categories (that's CAT-1, unaffected).
Renaming the Circle already exists (F0 `renameCircle`); this slice covers Color, Mark, and
Setup answers, all audited into Circle History (CS-4).

## Implement

- **Convex** (`circles.ts`):
  - `updateCircleSettings` mutation: args `{ circleId, color?, setupAnswers? }`.
    `requireCircleAccess` → Owner-only → `assertWritable()` → validate color
    (`isValidColorId`) → patch; Mark color follows Circle Color (Mark initials follow name,
    set on rename) → `recordEvent` per changed field (color from/to as palette labels; setup
    answer changes summarized). Changing setup answers does **not** modify existing Categories.
- **Web:** an Owner-only Circle Settings surface (name via `renameCircle`, color picker,
  setup answers). Hide for non-owners (courtesy); server enforces.

## Why this way

- Keep settings mutations Owner-gated server-side; the Member-can-still-create-Categories rule
  is preserved because category creation is a separate function with Member permission.
- Color is a cue, not identity — collisions allowed; never block on a duplicate color.

## How to test

- **Permissions:** Owner edits color/answers ✓; non-owner Member ✗; Removed Member ✗; archived
  Circle ✗.
- **Validation:** invalid color id ✗; valid ✓; Mark color reflects new Circle Color.
- **Invariant:** editing setup answers leaves existing Categories untouched (assert counts/ids
  unchanged).
- **History:** color/answer changes recorded with formatted from/to, no raw IDs.

## Done when

- Owner can change Color and Setup answers (Members cannot); Categories preserved across
  answer edits; changes audited; tests green; gates pass.

## Out of scope

Rename (F0), starter derivation (CS-1), Circle History view (CS-4).
</content>
