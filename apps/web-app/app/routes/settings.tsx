import { LIMITS, profileUpdateSchema } from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { Button } from "~/components/ui/button.js";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import { useUpdateProfile } from "~/lib/data.js";
import { useAppSession } from "~/lib/session.js";
import { useSnackbar } from "~/lib/snackbar.js";

/** Settings shell. App Version aids support diagnosis (PRD story 90); the
 * Privacy section will host the product-analytics opt-out (ADR 0013). */
const APP_VERSION = "0.0.0";

export default function Settings() {
  const session = useAppSession();
  const updateProfile = useUpdateProfile();
  const { show } = useSnackbar();
  const readyUser = session.state === "ready" ? session.user : null;
  const [displayName, setDisplayName] = useState(readyUser?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!readyUser) {
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = profileUpdateSchema.safeParse({ displayName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid display name");
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({ displayName: parsed.data.displayName });
      show("Profile updated.");
    } catch (caught) {
      console.error("updateProfile failed", caught);
      setError("Couldn't update your profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Profile</h2>
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <Field>
            <FieldLabel htmlFor="settings-display-name">Display name</FieldLabel>
            <Input
              id="settings-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={LIMITS.circleNameMax}
              autoComplete="name"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="settings-email">Google account email</FieldLabel>
            <Input
              id="settings-email"
              value={readyUser.email}
              readOnly
              disabled
              className="opacity-80"
            />
          </Field>

          {error ? <FieldError>{error}</FieldError> : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </section>

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
