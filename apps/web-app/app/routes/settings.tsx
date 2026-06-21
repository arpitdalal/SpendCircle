import { LIMITS, parseProfileUpdate } from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { Button } from "~/components/ui/button.js";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import { Switch } from "~/components/ui/switch.js";
import { useSetAnalyticsOptOut, useUpdateProfile } from "~/lib/data.js";
import { type SessionUser, useAppSession } from "~/lib/session.js";
import { useSnackbar } from "~/lib/snackbar.js";

/** Settings shell. App Version aids support diagnosis (PRD story 90); Privacy hosts
 * the product-analytics opt-out (ADR 0013). */
export default function Settings() {
  const session = useAppSession();

  if (session.state !== "ready") {
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Profile</h2>
        <ProfileSettingsForm key={session.user.id} user={session.user} />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Privacy</h2>
        <PrivacySettingsForm
          key={`privacy-${session.user.id}-${String(session.user.analyticsOptOut)}`}
          user={session.user}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">About</h2>
        <p className="text-sm text-muted-foreground">App version {__APP_VERSION__}</p>
      </section>
    </div>
  );
}

function ProfileSettingsForm({ user }: { user: SessionUser }) {
  const updateProfile = useUpdateProfile();
  const { show } = useSnackbar();
  // react-doctor-disable-next-line react-doctor/no-derived-useState -- editable form field seeded ONCE from the prop; reset-on-user-change is already handled by `key={session.user.id}` at the call site (line 27), which remounts this form so useState re-initializes.
  const [displayName, setDisplayName] = useState(user.displayName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmedDisplayName = displayName.trim();
  const canSave = trimmedDisplayName.length > 0 && !submitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = parseProfileUpdate({ displayName });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile({ displayName: parsed.value.displayName });
      show("Profile updated.");
    } catch (caught) {
      console.error("updateProfile failed", caught);
      setError("Couldn't update your profile. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          maxLength={LIMITS.displayNameMax}
          autoComplete="name"
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="settings-email">Google account email</FieldLabel>
        <Input id="settings-email" value={user.email} readOnly className="opacity-80" />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={!canSave}>
        {submitting ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

function PrivacySettingsForm({ user }: { user: SessionUser }) {
  const setAnalyticsOptOut = useSetAnalyticsOptOut();
  const { show } = useSnackbar();
  const [optOut, setOptOut] = useState(user.analyticsOptOut);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onToggle(nextOptOut: boolean) {
    if (submitting) {
      return;
    }

    setError(null);
    setOptOut(nextOptOut);
    setSubmitting(true);
    try {
      await setAnalyticsOptOut({ optOut: nextOptOut });
      show("Privacy preference updated.");
    } catch (caught) {
      console.error("setAnalyticsOptOut failed", caught);
      setOptOut(user.analyticsOptOut);
      setError("Couldn't update your privacy preference. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <Field orientation="horizontal">
        <Switch
          id="settings-analytics-opt-out"
          checked={optOut}
          disabled={submitting}
          aria-labelledby="settings-analytics-opt-out-label"
          onClick={() => void onToggle(!optOut)}
        />
        <FieldContent>
          <FieldLabel id="settings-analytics-opt-out-label" htmlFor="settings-analytics-opt-out">
            Opt out of product analytics
          </FieldLabel>
          <FieldDescription>
            When enabled, Spend Circle stops collecting product analytics (PostHog). Operational
            error monitoring (Sentry) stays on regardless.
          </FieldDescription>
        </FieldContent>
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
