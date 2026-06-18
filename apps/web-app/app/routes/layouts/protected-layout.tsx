import { Link, Navigate, Outlet, useLocation, useNavigation } from "react-router";
import { AccountMenu } from "~/components/account-menu.js";
import { CircleBottomNavSkeleton } from "~/components/circle-mobile-bottom-nav.js";
import { CircleSwitcher } from "~/components/circle-switcher.js";
import { PageSkeleton } from "~/components/skeleton.js";
import { Splash } from "~/components/splash.js";
import { isCircleScopedPath } from "~/lib/circle-path.js";
import { MOCKS } from "~/lib/env.js";
import { coversShellNavigation, usePendingRouteSkeleton } from "~/lib/route-skeleton.js";
import { useAppSession } from "~/lib/session.js";

/**
 * Gates the authenticated app across auth states (ADR 0017) and the product
 * Onboarding funnel (USR-1). The permission check is the reactive session
 * result, so live sign-out / revocation stay reactive with no second guard path.
 */
export default function ProtectedLayout() {
  const session = useAppSession();
  const location = useLocation();
  const onOnboarding = location.pathname === "/onboarding";
  // Unconditional so the pending-navigation subscription is stable across the auth
  // guard's state flips; only consulted in the Ready branch below.
  const showSkeleton = usePendingRouteSkeleton(coversShellNavigation);
  // When the shell skeleton covers a navigation INTO a Circle (a cross-Circle switch,
  // or Home→Circle), keep a Circle bottom-bar placeholder mounted so the mobile bar
  // doesn't flash out while CircleLayout is unmounted — the destination is a Circle, so
  // it will own a real bar once it resolves.
  const navigation = useNavigation();
  const pendingTo = navigation.location?.pathname;
  const showBottomNavSkeleton = showSkeleton && pendingTo != null && isCircleScopedPath(pendingTo);

  if (session.state === "loading") {
    return <Splash />;
  }
  if (session.state === "unauthenticated") {
    return <Navigate to="/signin" replace />;
  }
  if (session.state === "bootstrap") {
    return onOnboarding ? <Outlet /> : <Navigate to="/onboarding" replace />;
  }
  if (!session.user.onboardingComplete) {
    return onOnboarding ? <Outlet /> : <Navigate to="/onboarding" replace />;
  }
  if (onOnboarding) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            prefetch="intent"
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight"
          >
            <BrandMark />
            Spend Circle
          </Link>
          <CircleSwitcher />
        </div>
        <AccountMenu user={session.user} showSignOut={!MOCKS} />
      </header>
      <main className="flex-1 px-4 pb-24 pt-6 sm:pb-6">
        {showSkeleton ? <PageSkeleton /> : <Outlet />}
      </main>
      {showBottomNavSkeleton ? <CircleBottomNavSkeleton /> : null}
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
