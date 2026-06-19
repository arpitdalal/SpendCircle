Be extremely concise and sacrifice grammar for the sake of concision.

Don't cut corners. Be thorough in your work.

Fix issues from the root, don't settle for a bandaid.

No typescript `as` casts, use type inference, zod, or other type-safe tools. Type casting should be the last resort, if needed, confirm with the user by presenting why it is absolutely needed.

No explicit return types for functions, use type inference, zod, or other type-safe tools. Only use explicit return types if absolutely necessary. Library type code needs more explicit return types than application code.

Never mock implementations or the return values of related hooks/modules (our own logic). Mock only true boundaries: 3rd-party deps or lower-level deps that genuinely need it (network, IO, an unrunnable vendor component).

Tests must exercise the real business logic and the real wiring between our modules, not faked seams. See `docs/adr/0006-test-first-development-quality-bar.md`.

Tests must not redefine the same scaffolding per file (doubles, fixtures, render wiring, contract logic) with only slightly different data. Extract it into one well-designed lower-level helper driven by arguments — think hard about where the seam belongs and what the config surface should be, encode the contract once so it can't drift. Copy-pasted `setup` tweaked per file is a smell. Web tests share `apps/web-app/app/test/convex-react.tsx`.

No bespoke hand written alternatives to do the same thing that a helper already does, look for helpers. If not present and other part of the app already does something similar, then create a scalable and flexible abstraction to reuse everywhere. Refactor to make it clean code.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `arpitdalal/SpendCircle`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` points to context-specific docs. See `docs/agents/domain.md`.

## Cursor Cloud specific instructions

Standard commands live in `README.md` / root `package.json` (`pnpm lint`, `typecheck`, `test`, `build`). Cloud-specific gotchas:

- **Deps**: startup update script runs `pnpm install --frozen-lockfile --ignore-scripts` then `pnpm rebuild esbuild @biomejs/biome msw`. The root `prepare` (`lefthook install`) is skipped on purpose — it fails under the agent's custom `core.hooksPath` and git hooks aren't needed here.
- **No cloud Convex / Google OAuth here.** The only way to run the app/backend end-to-end is the self-hosted Convex Docker backend + the flag-gated email+password test-auth bypass (ADR 0019), same path as CI E2E.
- **Docker** is installed in the snapshot but the daemon isn't auto-started. Start it before E2E or running a local backend: `sudo dockerd >/tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`. `daemon.json` is preconfigured (`fuse-overlayfs`, `containerd-snapshotter` disabled — required for Docker 29 in this VM).
- **E2E**: `pnpm test:e2e:local` boots an ephemeral backend, deploys, runs Playwright, tears down (needs Docker running). Playwright browsers + system deps are in the snapshot.
- **Run app live** (manual/GUI testing): boot a backend + deploy like `scripts/e2e-local.sh` does (image pinned in `.github/workflows/e2e.yml`, ports 3210/3211; `convex env set … E2E_TEST_AUTH 1` + `convex deploy -y`), then `VITE_E2E=true VITE_CONVEX_URL=http://127.0.0.1:3210 VITE_CONVEX_SITE_URL=http://127.0.0.1:3211 pnpm dev`. `build`/`dev` need those two `VITE_CONVEX_`* vars (root `.env.local` or inline).
- **Sign in without Google** (only when `VITE_E2E=true`): in the browser console run `await window.__scE2E.signIn("you@example.com","Passw0rd-123","Name")` — signs up + creates the user's Personal Circle, then reload. Recording an expense first requires creating a category.

