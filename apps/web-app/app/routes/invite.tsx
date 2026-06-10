import { useParams } from "react-router";

/**
 * Opaque token-only Invitation landing (ADR 0016 exception). The token is
 * validated server-side before any Circle context is revealed; this scaffold
 * renders the landing shell that the acceptance flow will build on.
 */
export default function Invite() {
  const { token } = useParams();
  return (
    <div className="space-y-4 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">You've been invited</h1>
      <p className="text-sm text-muted-foreground">Validating your invitation…</p>
      <p className="text-xs text-faint">token: {token}</p>
    </div>
  );
}
