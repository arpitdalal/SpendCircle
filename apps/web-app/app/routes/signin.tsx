import { Link } from "react-router";
import { Button } from "~/components/ui/button.js";
import { signInWithGoogle } from "~/lib/auth-client.js";

/**
 * Sign-in wrap (ADR 0014): conspicuous copy ties account creation to the Terms
 * and Privacy Policy, with no separate checkbox. Google is the only provider.
 */
export default function SignIn() {
  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Spend Circle</h1>
        <p className="text-sm text-neutral-400">Track money together in shared circles.</p>
      </div>

      <Button className="w-full" onClick={() => void signInWithGoogle("/")}>
        Continue with Google
      </Button>

      <p className="text-xs text-neutral-500">
        By continuing you agree to our{" "}
        <Link to="/terms" className="underline hover:text-neutral-300">
          Terms
        </Link>{" "}
        and{" "}
        <Link to="/privacy" className="underline hover:text-neutral-300">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
