import { inviteEmailSchema } from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { href, useNavigate } from "react-router";
import { RowsSkeleton, SkeletonRegion } from "~/components/skeleton.js";
import { Avatar } from "~/components/ui/avatar.js";
import { Button } from "~/components/ui/button.js";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import {
  type Circle,
  type Member,
  useCreateInvitation,
  useLeaveCircle,
  useMembers,
} from "~/lib/data.js";
import { MOCKS } from "~/lib/env.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * Circle-scoped Member List (CONTEXT: Member List; PRD story 43). Read-only list
 * plus an Owner-only invite form (MEM-2) that surfaces a copyable Invitation
 * Link until EML-2 automates email delivery.
 */
export default function CircleMembers() {
  const circle = useCircle();
  const members = useMembers(circle.id);
  const isOwner = members?.some((member) => member.isSelf && member.role === "owner") ?? false;
  const isSelfMember = members?.some((member) => member.isSelf) ?? false;
  const canInvite = circle.kind === "regular" && isOwner;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">Members</h2>
      {canInvite ? <InviteMemberForm circleId={circle.id} /> : null}
      <MemberList members={members} />
      {circle.kind !== "personal" && isSelfMember ? (
        <LeaveCircle circleId={circle.id} isOwner={isOwner} />
      ) : null}
    </div>
  );
}

function InviteMemberForm({ circleId }: { circleId: Circle["id"] }) {
  const createInvitation = useCreateInvitation();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setSubmitError(null);
    setInviteLink(null);

    const parsed = inviteEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      const { token } = MOCKS
        ? { token: "mock-invite-token" }
        : await createInvitation({ circleId, email: parsed.data.email });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setInviteLink(`${origin}/invite/${token}`);
      setEmail("");
    } catch (caught) {
      setSubmitError(
        mutationErrorMessageForUser(caught, "Couldn't send the invitation. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const showFieldError = fieldError != null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label="Invite member"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <p className="text-sm text-muted-foreground">
        Invite someone by email. They&apos;ll receive a link to join this Circle.
      </p>

      <Field>
        <FieldLabel htmlFor="invite-email">Email address</FieldLabel>
        <Input
          id="invite-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (fieldError) {
              setFieldError(null);
            }
            if (submitError) {
              setSubmitError(null);
            }
          }}
          placeholder="name@example.com"
          autoComplete="email"
          aria-invalid={showFieldError}
          aria-describedby={showFieldError ? "invite-email-error" : undefined}
        />
        {showFieldError ? (
          <FieldError id="invite-email-error" errors={[{ message: fieldError }]} />
        ) : null}
      </Field>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      {inviteLink ? (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
        >
          <p className="text-sm font-medium">Invitation created — share this link:</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              readOnly
              value={inviteLink}
              aria-label="Invitation link"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => void navigator.clipboard.writeText(inviteLink)}
            >
              Copy link
            </Button>
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={submitting || email.trim() === ""}>
        {submitting ? "Inviting…" : "Invite member"}
      </Button>
    </form>
  );
}

function MemberList({ members }: { members: Member[] | null | undefined }) {
  if (members === undefined) {
    return (
      <SkeletonRegion label="Loading members…" testId="members-skeleton">
        <RowsSkeleton rows={4} />
      </SkeletonRegion>
    );
  }
  // null ≡ inaccessible Circle (ADR 0016); the Circle guard already gated entry, so
  // a late null means there's nothing to show. An empty list can't normally happen
  // (every Circle keeps its Owner) — fall through to the same message defensively.
  if (members === null || members.length === 0) {
    return <p className="text-sm text-muted-foreground">Members are unavailable.</p>;
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
        >
          <Avatar name={member.displayName} image={member.image} />
          {/* Name + (You) form one flex-1 cluster: the name truncates so a long
              Google display name can't push the Owner badge off a narrow row,
              while (You) stays pinned beside it. */}
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium">{member.displayName}</span>
            {member.isSelf ? (
              <span className="shrink-0 text-xs text-muted-foreground">(You)</span>
            ) : null}
          </span>
          {member.role === "owner" ? (
            <span className="shrink-0 rounded-full border border-primary/40 bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-foreground">
              Owner
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LeaveCircle({ circleId, isOwner }: { circleId: Circle["id"]; isOwner: boolean }) {
  const leaveCircle = useLeaveCircle();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isOwner) {
    return (
      <section
        aria-label="Leave circle"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <p className="text-sm text-muted-foreground">
          Transfer ownership before leaving this Circle.
        </p>
      </section>
    );
  }

  async function onConfirmLeave() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await leaveCircle({ circleId });
      navigate(href("/"));
    } catch (caught) {
      setSubmitError(mutationErrorMessageForUser(caught, "Couldn't leave. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-label="Leave circle"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      {confirming ? (
        <fieldset className="space-y-3 border-0 p-0">
          <legend className="text-sm font-medium">
            Are you sure you want to leave this Circle?
          </legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => {
                setConfirming(false);
                setSubmitError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={submitting}
              onClick={() => void onConfirmLeave()}
            >
              {submitting ? "Leaving…" : "Confirm Leave"}
            </Button>
          </div>
        </fieldset>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setConfirming(true)}
        >
          Leave Circle
        </Button>
      )}

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
    </section>
  );
}
