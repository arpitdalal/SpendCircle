import { Dialog } from "@base-ui/react/dialog";
import { inviteEmailSchema } from "@spend-circle/domain";
import { type FormEvent, useId, useState } from "react";
import { href, useNavigate } from "react-router";
import { RowsSkeleton, SkeletonRegion } from "~/components/skeleton.js";
import { Avatar } from "~/components/ui/avatar.js";
import { Button } from "~/components/ui/button.js";
import { buttonVariants } from "~/components/ui/button-variants.js";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import { mobileSheetBackdropClassName } from "~/components/ui/mobile-sheet-primitives.js";
import {
  type Circle,
  type Member,
  type PendingInvitation,
  useCreateInvitation,
  useLeaveCircle,
  useMembers,
  usePendingInvitations,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
} from "~/lib/data.js";
import { MOCKS } from "~/lib/env.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatExpiresIn(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    return "Expired";
  }
  const days = Math.ceil(ms / DAY_MS);
  return days === 1 ? "Expires in 1 day" : `Expires in ${days} days`;
}

/**
 * Circle-scoped Member List (CONTEXT: Member List; PRD story 43). Read-only list
 * plus an Owner-only invite form (MEM-2). Owners can manage pending invitations
 * (MEM-4) and remove members (MEM-5); non-owner members can leave (MEM-6).
 */
export default function CircleMembers() {
  const circle = useCircle();
  const members = useMembers(circle.id);
  const isOwner = members?.some((member) => member.isSelf && member.role === "owner") ?? false;
  const canWrite = circle.kind === "regular" && circle.status === "active";
  const isSelfMember = members?.some((member) => member.isSelf) ?? false;
  const canInvite = canWrite && isOwner;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold tracking-tight">Members</h2>
      {canInvite ? <InviteMemberForm circleId={circle.id} /> : null}
      {canInvite ? <PendingInvitationsList circleId={circle.id} /> : null}
      <MemberList circleId={circle.id} members={members} canRemoveMembers={canWrite && isOwner} />
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
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setSubmitError(null);
    setSuccessEmail(null);

    const parsed = inviteEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      await createInvitation({ circleId, email: parsed.data.email });
      setSuccessEmail(parsed.data.email);
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

      {successEmail ? (
        <p role="status" className="text-sm text-green-700">
          Invitation sent to {successEmail}.
        </p>
      ) : null}

      <Button type="submit" disabled={submitting || email.trim() === ""}>
        {submitting ? "Inviting…" : "Invite member"}
      </Button>
    </form>
  );
}

function PendingInvitationsList({ circleId }: { circleId: Circle["id"] }) {
  const pendingInvitations = usePendingInvitations(circleId);
  const resendInvitation = useResendInvitation();
  const revokeInvitation = useRevokeInvitation();
  const [resendingId, setResendingId] = useState<PendingInvitation["id"] | null>(null);
  const [revokingId, setRevokingId] = useState<PendingInvitation["id"] | null>(null);
  const [resendLinkById, setResendLinkById] = useState<
    Partial<Record<PendingInvitation["id"], string>>
  >({});
  const [resendErrorById, setResendErrorById] = useState<
    Partial<Record<PendingInvitation["id"], string>>
  >({});
  const [revokeErrorById, setRevokeErrorById] = useState<
    Partial<Record<PendingInvitation["id"], string>>
  >({});
  const [revokeSuccessById, setRevokeSuccessById] = useState<
    Partial<Record<PendingInvitation["id"], string>>
  >({});

  if (pendingInvitations === undefined) {
    return (
      <SkeletonRegion label="Loading pending invitations…" testId="pending-invitations-skeleton">
        <RowsSkeleton rows={2} />
      </SkeletonRegion>
    );
  }

  if (pendingInvitations === null || pendingInvitations.length === 0) {
    return pendingInvitations === null ? null : (
      <p className="text-sm text-muted-foreground">No pending invitations.</p>
    );
  }

  async function onResend(invitation: PendingInvitation) {
    if (resendingId != null) {
      return;
    }
    setResendingId(invitation.id);
    setResendErrorById((prev) => ({ ...prev, [invitation.id]: undefined }));
    setResendLinkById((prev) => ({ ...prev, [invitation.id]: undefined }));
    try {
      const { token } = MOCKS
        ? { token: "mock-resend-token" }
        : await resendInvitation({ invitationId: invitation.id });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setResendLinkById((prev) => ({
        ...prev,
        [invitation.id]: `${origin}/invite/${token}`,
      }));
    } catch (caught) {
      setResendErrorById((prev) => ({
        ...prev,
        [invitation.id]: mutationErrorMessageForUser(
          caught,
          "Couldn't resend the invitation. Please try again.",
        ),
      }));
    } finally {
      setResendingId(null);
    }
  }

  async function onRevoke(invitation: PendingInvitation) {
    if (revokingId != null) {
      return;
    }
    setRevokingId(invitation.id);
    setRevokeErrorById((prev) => ({ ...prev, [invitation.id]: undefined }));
    setRevokeSuccessById((prev) => ({ ...prev, [invitation.id]: undefined }));
    try {
      await revokeInvitation({ invitationId: invitation.id });
      setRevokeSuccessById((prev) => ({
        ...prev,
        [invitation.id]: `Revoked invitation for ${invitation.email}.`,
      }));
    } catch (caught) {
      setRevokeErrorById((prev) => ({
        ...prev,
        [invitation.id]: mutationErrorMessageForUser(
          caught,
          "Couldn't revoke the invitation. Please try again.",
        ),
      }));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section
      aria-label="Pending invitations"
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="text-sm font-medium">Pending invitations</h3>
      <ul className="space-y-3">
        {pendingInvitations.map((invitation) => {
          const resendLink = resendLinkById[invitation.id];
          const resendError = resendErrorById[invitation.id];
          const revokeError = revokeErrorById[invitation.id];
          const revokeSuccess = revokeSuccessById[invitation.id];
          const resendBusy = resendingId === invitation.id;
          const revokeBusy = revokingId === invitation.id;

          return (
            <li
              key={invitation.id}
              className="space-y-2 rounded-lg border border-border/70 bg-background px-3 py-2.5"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatExpiresIn(invitation.expiresAt)}
                    {invitation.resendCount > 0
                      ? ` · Resent ${invitation.resendCount} time${invitation.resendCount === 1 ? "" : "s"}`
                      : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendBusy || revokeBusy}
                    onClick={() => void onResend(invitation)}
                  >
                    {resendBusy ? "Resending…" : "Resend"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendBusy || revokeBusy}
                    onClick={() => void onRevoke(invitation)}
                  >
                    {revokeBusy ? "Revoking…" : "Revoke"}
                  </Button>
                </div>
              </div>

              {resendError ? (
                <p role="alert" className="text-sm text-destructive">
                  {resendError}
                </p>
              ) : null}

              {revokeError ? (
                <p role="alert" className="text-sm text-destructive">
                  {revokeError}
                </p>
              ) : null}

              {revokeSuccess ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {revokeSuccess}
                </p>
              ) : null}

              {resendLink ? (
                <div
                  role="status"
                  className="space-y-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
                >
                  <p className="text-sm font-medium">New invitation link — share this link:</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      readOnly
                      value={resendLink}
                      aria-label="Invitation link"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => void navigator.clipboard.writeText(resendLink)}
                    >
                      Copy link
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RemoveMemberDialog({
  open,
  onOpenChange,
  memberName,
  onConfirm,
  confirming,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  onConfirm: () => void;
  confirming: boolean;
  error: string | null;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={mobileSheetBackdropClassName} />
        <Dialog.Popup
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2",
            "space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl outline-none",
            "data-open:animate-fade-in",
          )}
        >
          <Dialog.Title id={titleId} className="font-display text-lg font-semibold tracking-tight">
            Remove member?
          </Dialog.Title>
          <Dialog.Description id={descriptionId} className="text-sm text-muted-foreground">
            {memberName} will lose access to this Circle. Their past Transactions stay visible with
            the name and photo shown now.
          </Dialog.Description>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close
              type="button"
              disabled={confirming}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Cancel
            </Dialog.Close>
            <Button
              type="button"
              disabled={confirming}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirm}
            >
              {confirming ? "Removing…" : "Remove member"}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MemberList({
  circleId,
  members,
  canRemoveMembers,
}: {
  circleId: Circle["id"];
  members: Member[] | null | undefined;
  canRemoveMembers: boolean;
}) {
  const removeMember = useRemoveMember();
  const [removingId, setRemovingId] = useState<Member["id"] | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const removingMember = members?.find((member) => member.id === removingId);

  async function handleRemoveConfirm() {
    if (!removingId) {
      return;
    }
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeMember({ circleId, memberId: removingId });
      setRemovingId(null);
    } catch (caught) {
      setRemoveError(
        mutationErrorMessageForUser(caught, "Couldn't remove the member. Please try again."),
      );
    } finally {
      setRemoving(false);
    }
  }

  if (members === undefined) {
    return (
      <SkeletonRegion label="Loading members…" testId="members-skeleton">
        <RowsSkeleton rows={4} />
      </SkeletonRegion>
    );
  }
  if (members === null || members.length === 0) {
    return <p className="text-sm text-muted-foreground">Members are unavailable.</p>;
  }

  return (
    <>
      <ul className="space-y-2">
        {members.map((member) => {
          const canRemove =
            canRemoveMembers &&
            member.role !== "owner" &&
            !member.isSelf &&
            member.status === "active";

          return (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
            >
              <Avatar name={member.displayName} image={member.image} />
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
              {canRemove ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 px-3"
                  aria-label={`Remove ${member.displayName}`}
                  onClick={() => {
                    setRemoveError(null);
                    setRemovingId(member.id);
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <RemoveMemberDialog
        open={removingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingId(null);
            setRemoveError(null);
          }
        }}
        memberName={removingMember?.displayName ?? ""}
        onConfirm={() => void handleRemoveConfirm()}
        confirming={removing}
        error={removeError}
      />
    </>
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
