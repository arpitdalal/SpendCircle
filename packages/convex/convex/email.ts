import { vOnCompleteValidator, Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";

/**
 * Transactional email via Resend (ADR 0008). v1 sends only Welcome + Invitation
 * emails — not activity notifications (PRD 86).
 *
 * Required deployment env vars (Convex deployment env, like auth.ts):
 * RESEND_API_KEY, RESEND_FROM_EMAIL
 */

export const WELCOME_SUBJECT = "Welcome to Spend Circle";
export const INVITATION_SUBJECT = "You're invited to join a Spend Circle";

// Durable, throttled handoff to Resend — the shared seam EML-2 / FBK-1 reuse.
// maxParallelism caps concurrent sends so a vendor outage can't stampede Resend.
// (Free-plan ceiling is 20 across ALL pools/workflows — keep the sum under that.)
// Welcome email isn't urgent: back off generously. maxAttempts is TOTAL attempts
// (5 = 1 initial + 4 retries): 30s, 60s, 120s, 240s of backoff (+jitter) ≈ 7.5 min cover.
export const emailPool = new Workpool(components.emailWorkpool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 5, initialBackoffMs: 30_000, base: 2 },
});

/** Pure HTML builder — no financial content (PRD 84). */
export function welcomeHtml(displayName: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${WELCOME_SUBJECT}</title></head>
<body>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Welcome to Spend Circle — a simple way to track shared spending with the people you trust.</p>
  <p>Your Personal Circle is ready. Open the app to finish setting up your profile and start organizing expenses together.</p>
  <p>— The Spend Circle team</p>
</body>
</html>`;
}

/** Pure HTML builder — no financial content (PRD 84). */
export function invitationHtml(args: {
  inviteLink: string;
  circleName: string;
  ownerDisplayName: string;
  ownerImage: string | undefined;
  recipientEmail: string;
}) {
  const { inviteLink, circleName, ownerDisplayName, recipientEmail } = args;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${INVITATION_SUBJECT}</title></head>
<body>
  <p>Hi ${escapeHtml(recipientEmail)},</p>
  <p>${escapeHtml(ownerDisplayName)} has invited you to join the <strong>${escapeHtml(circleName)}</strong> Circle on Spend Circle.</p>
  <p><a href="${escapeHtml(inviteLink)}">Accept the invitation</a></p>
  <p>This link expires in 7 days and can only be used once.</p>
  <p>— The Spend Circle team</p>
</body>
</html>`;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Resend vendor wiring — single seam for EML-2 / FBK-1. Uses fetch (not SDK).
 *  Returns true on a confirmed 2xx; false when env is unset (no-op). THROWS on
 *  fetch rejection or non-2xx so the Workpool retries the handoff.
 *  Pass `idempotencyKey` so a retried send dedupes at Resend instead of re-delivering. */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.error("Resend env not configured; skipping email send");
    return false;
  }
  // fetch can REJECT (DNS/TLS/timeout) before any response — let it propagate so the pool retries.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Resend dedupes same-key sends for 24h → safe to retry the whole action.
      ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${body}`);
  }
  return true;
}

export const welcomePayload = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return {
      alreadySent: user.welcomeSentAt !== undefined,
      email: user.email,
      displayName: user.displayName,
    };
  },
});

export const markWelcomed = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user && user.welcomeSentAt === undefined) {
      await ctx.db.patch(userId, { welcomeSentAt: Date.now() });
    }
  },
});

export const sendWelcomeEmail = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const p = await ctx.runQuery(internal.email.welcomePayload, { userId });
    if (!p || p.alreadySent) {
      return;
    }
    const sent = await sendEmail({
      to: p.email,
      subject: WELCOME_SUBJECT,
      html: welcomeHtml(p.displayName),
      idempotencyKey: `welcome:${userId}`,
    });
    if (sent) {
      await ctx.runMutation(internal.email.markWelcomed, { userId });
    }
  },
});

export const onWelcomeRunComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ userId: v.id("users") })),
  handler: async (_ctx, { context, result }) => {
    if (result.kind === "failed") {
      console.error("Welcome email exhausted all retries", context.userId, result.error);
      // TODO(OBS-1): Sentry.captureMessage here.
    }
    // result.kind === "success" | "canceled" → nothing to do.
  },
});

export const invitationPayload = internalQuery({
  args: {
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, { invitationId }) => {
    const invite = await ctx.db.get(invitationId);
    if (invite?.status !== "pending") {
      return null;
    }
    const circle = await ctx.db.get(invite.circleId);
    const owner = await ctx.db.get(invite.invitedByUserId);
    if (!circle || !owner) {
      return null;
    }
    return {
      recipientEmail: invite.emailLower,
      circleName: circle.name,
      ownerDisplayName: owner.displayName,
      ownerImage: owner.image,
    };
  },
});

export const sendInvitationEmail = internalAction({
  args: {
    invitationId: v.id("invitations"),
    token: v.string(),
  },
  handler: async (ctx, { invitationId, token }) => {
    const p = await ctx.runQuery(internal.email.invitationPayload, { invitationId });
    if (!p) {
      return;
    }
    const siteUrl = process.env.SITE_URL ?? "http://127.0.0.1:5173";
    const inviteLink = `${siteUrl}/invite/${token}`;
    await sendEmail({
      to: p.recipientEmail,
      subject: INVITATION_SUBJECT,
      html: invitationHtml({
        inviteLink,
        circleName: p.circleName,
        ownerDisplayName: p.ownerDisplayName,
        ownerImage: p.ownerImage,
        recipientEmail: p.recipientEmail,
      }),
      idempotencyKey: `invite:${invitationId}`,
    });
  },
});

export const onInvitationRunComplete = internalMutation({
  args: vOnCompleteValidator(v.object({ invitationId: v.id("invitations") })),
  handler: async (_ctx, { context, result }) => {
    if (result.kind === "failed") {
      console.error("Invitation email exhausted all retries", context.invitationId, result.error);
      // TODO(OBS-1): Sentry.captureMessage here.
    }
  },
});
