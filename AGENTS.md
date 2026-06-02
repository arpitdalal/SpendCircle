Be extremely concise and sacrifice grammar for the sake of concision.
Don't cut corners. Be thorough in your work.
Fix issues from the root, don't settle for a bandaid.
No typescript `as` casts, use type inference, zod, or other type-safe tools. Type casting should be the last resort, if needed, confirm with the user by presenting why it is absolutely needed.
No explicit return types for functions, use type inference, zod, or other type-safe tools. Only use explicit return types if absolutely necessary. Library type code needs more explicit return types than application code.
Never mock implementations or the return values of related hooks/modules (our own logic). Mock only true boundaries: 3rd-party deps or lower-level deps that genuinely need it (network, IO, an unrunnable vendor component). Tests must exercise the real business logic and the real wiring between our modules, not faked seams. See `docs/adr/0006-test-first-development-quality-bar.md`.
Tests must not redefine the same scaffolding per file (doubles, fixtures, render wiring, contract logic) with only slightly different data. Extract it into one well-designed lower-level helper driven by arguments — think hard about where the seam belongs and what the config surface should be, encode the contract once so it can't drift. Copy-pasted `setup` tweaked per file is a smell. Web tests share `apps/web-app/app/test/convex-react.tsx`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `arpitdalal/SpendCircle`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` points to context-specific docs. See `docs/agents/domain.md`.
