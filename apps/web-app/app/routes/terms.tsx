import { Link } from "react-router";

export default function Terms() {
  return (
    <article className="space-y-4 text-sm text-muted-foreground">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Terms & Conditions
      </h1>
      <p>
        Placeholder Terms for v1. Hosted here in the web app initially; this may move to the
        marketing site later.
      </p>
      <Link to="/signin" className="underline hover:text-foreground">
        Back to sign in
      </Link>
    </article>
  );
}
