import { useEffect } from "react";
import { Navigate } from "react-router";
import { Splash } from "~/components/splash.js";
import { useSnackbar } from "~/lib/snackbar.js";

/**
 * Root catch-all (ADR 0017): any unmatched path gets the same generic,
 * non-revealing fallback as inaccessible deep links — the unavailable-link
 * snackbar plus the User's default safe route. There is no dedicated 404 page.
 */
export default function Splat() {
  const { showUnavailableLink } = useSnackbar();

  useEffect(() => {
    showUnavailableLink();
  }, [showUnavailableLink]);

  return (
    <>
      <Splash label="Taking you home…" />
      <Navigate to="/" replace />
    </>
  );
}
