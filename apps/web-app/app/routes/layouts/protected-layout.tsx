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
    <div className="flex min-h-dvh flex-col bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-semibold">
            Spend Circle
          </Link>
          <CircleSwitcher />
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="hidden sm:inline">{session.user.displayName}</span>
          <Link to="/settings" className="hover:text-neutral-100">
            Settings
          </Link>
          {!MOCKS && (
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
