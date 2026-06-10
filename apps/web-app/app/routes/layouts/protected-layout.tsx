import { Link, Navigate, Outlet, useLocation } from "react-router";
import { CircleSwitcher } from "~/components/circle-switcher.js";
import { Splash } from "~/components/splash.js";
import { Button } from "~/components/ui/button.js";
import { signOut } from "~/lib/auth-client.js";
import { MOCKS } from "~/lib/env.js";
import { useAppSession } from "~/lib/session.js";

/**
 * Gates the authenticated app across the three auth states (ADR 0017). The
 * permission check is the reactive session result, so live sign-out / revocation
 * stay reactive with no second non-reactive guard path.
 */
export default function ProtectedLayout() {
  const session = useAppSession();
  const location = useLocation();
  const onOnboarding = location.pathname === "/onboarding";

  if (session.state === "loading") {
    return <Splash />;
  }
  if (session.state === "unauthenticated") {
    return <Navigate to="/signin" replace />;
  }
  if (session.state === "onboarding") {
    return onOnboarding ? <Outlet /> : <Navigate to="/onboarding" replace />;
  }
  // Ready: keep the onboarding route from lingering once bootstrapped.
  if (onOnboarding) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight"
          >
            <BrandMark />
            Spend Circle
          </Link>
          <CircleSwitcher />
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{session.user.displayName}</span>
          <Link to="/settings" className="transition-colors hover:text-foreground">
            Settings
          </Link>
          {!MOCKS && (
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 pb-24 pt-6 sm:pb-6">
        <Outlet />
      </main>
    </div>
  );
}

/** The circle motif as the brand glyph: two concentric rings in the accent. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative flex size-6 items-center justify-center rounded-full border-2 border-primary/35"
    >
      <span className="size-2.5 rounded-full bg-primary" />
    </span>
  );
}
