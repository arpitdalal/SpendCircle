/** Settings shell. App Version aids support diagnosis (PRD story 90); the
 * Privacy section will host the product-analytics opt-out (ADR 0013). */
const APP_VERSION = "0.0.0";

export default function Settings() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Privacy</h2>
        <p className="text-sm text-muted-foreground">
          Product analytics opt-out lives here. Operational error monitoring stays on regardless.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">About</h2>
        <p className="text-sm text-muted-foreground">App version {APP_VERSION}</p>
      </section>
    </div>
  );
}
