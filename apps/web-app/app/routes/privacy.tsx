import { Link } from "react-router";

export default function Privacy() {
  return (
    <article className="space-y-4 text-sm text-neutral-300">
      <h1 className="text-xl font-semibold text-neutral-100">Privacy Policy</h1>
      <p>
        Placeholder Privacy Policy for v1. Product analytics are enabled after acceptance and can be
        turned off in Settings → Privacy.
      </p>
      <Link to="/signin" className="underline hover:text-neutral-100">
        Back to sign in
      </Link>
    </article>
  );
}
