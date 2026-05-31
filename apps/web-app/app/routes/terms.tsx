import { Link } from "react-router";

export default function Terms() {
  return (
    <article className="space-y-4 text-sm text-neutral-300">
      <h1 className="text-xl font-semibold text-neutral-100">Terms & Conditions</h1>
      <p>
        Placeholder Terms for v1. Hosted here in the web app initially; this may move to the
        marketing site later.
      </p>
      <Link to="/signin" className="underline hover:text-neutral-100">
        Back to sign in
      </Link>
    </article>
  );
}
