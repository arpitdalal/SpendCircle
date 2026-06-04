import { index, layout, prefix, type RouteConfig, route } from "@react-router/dev/routes";

/**
 * Config-based routes (ADR 0017) — chosen over file-based routing because
 * file-name conventions fight the `slug-id` refs and Circle-scoped nesting of
 * ADR 0016. The tree splits on authentication: a public layout and a protected
 * layout that gates on reactive Convex auth across three states.
 */
export default [
  // Public surfaces. The protected layout never wraps these.
  layout("routes/layouts/public-layout.tsx", [
    route("signin", "routes/signin.tsx"),
    route("terms", "routes/terms.tsx"),
    route("privacy", "routes/privacy.tsx"),
    // Opaque, token-only Invitation landing — the ADR 0016 exception.
    route("invite/:token", "routes/invite.tsx"),
  ]),

  // Authenticated app. The protected layout shows a splash while auth resolves,
  // redirects to /signin when unauthenticated, and renders the onboarding branch
  // until the User is bootstrapped.
  layout("routes/layouts/protected-layout.tsx", [
    index("routes/home.tsx"),
    route("onboarding", "routes/onboarding.tsx"),
    route("settings", "routes/settings.tsx"),

    // Circle-scoped routes. The Circle guard resolves/canonicalizes/guards the
    // Circle and provides it to children via Outlet context; object routes
    // resolve their own ref within the resolved Circle (ADR 0016/0017).
    ...prefix("circles", [
      route(":circleRef", "routes/layouts/circle-layout.tsx", [
        index("routes/circle/dashboard.tsx"),
        route("transactions", "routes/circle/transactions.tsx"),
        // The Transaction DETAIL object route (ADR 0016/0017) — the REFERENCE object
        // route: a canonical `slug-id` ref under the resolved Circle, resolving its own
        // target by ID via `useResolvedTransactionDetail` and falling back to the Circle's
        // Transactions route. The read surface for Audit Metadata + Transaction History
        // (TXN-4). Lands WITH its feature — no caller-less placeholder.
        route("transactions/:transactionRef", "routes/circle/transaction-detail.tsx"),
        // The Transaction edit object route (ADR 0016/0017): a canonical `slug-id`
        // ref under the resolved Circle, resolving its own target by ID via
        // `useResolvedTransaction` and falling back to the Circle's Transactions
        // route. Lands WITH its feature (TXN-5) — no caller-less placeholder.
        route("transactions/:transactionRef/edit", "routes/circle/transaction-edit.tsx"),
        route("categories", "routes/circle/categories.tsx"),
      ]),
    ]),
  ]),

  // Catch-all splat: same generic, non-revealing fallback; no dedicated 404.
  route("*", "routes/splat.tsx"),
] satisfies RouteConfig;
