import { Splash } from "~/components/splash.js";

/**
 * Onboarding branch: a Google session exists but the Spend Circle User record
 * has not propagated yet (ADR 0017). The User and Personal Circle are created by
 * the Better Auth `onCreateUser` trigger during the OAuth callback, so this is a
 * brief splash; when the reactive session flips to "ready" the protected layout
 * redirects to the app shell.
 */
export default function Onboarding() {
  return <Splash label="Setting up your account…" />;
}
