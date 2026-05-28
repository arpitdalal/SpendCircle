# Test-first development quality bar

Spend Circle uses test-first development with robust Vitest unit tests, integration tests, and Playwright end-to-end coverage as a project constraint. Domain helpers, Convex permission paths, histories, lifecycle rules, and critical responsive UI flows should be covered so future changes and refactors do not depend on manual regression testing.

Local and dev environments may use seed data with fake Circles, Members, Transactions, and Categories for tests, screenshots, and development. Tests must not hit production data.

Tests use fake identities or a dev-only auth bypass rather than real Google sign-in. Production authentication remains Google-only.

MSW is used to mock third-party services such as Google auth, Resend, Sentry, and PostHog in tests where network boundaries matter.
