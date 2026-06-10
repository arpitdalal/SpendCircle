import { Link } from "react-router";

export default function Privacy() {
  return (
    <article className="space-y-4 text-sm text-muted-foreground">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Privacy Policy
      </h1>
      <p>
        Placeholder Privacy Policy for v1. Product analytics are enabled after acceptance and can be
        turned off in Settings → Privacy.
      </p>
      <Link to="/signin" className="underline hover:text-foreground">
        Back to sign in
      </Link>
    </article>
  );
}
