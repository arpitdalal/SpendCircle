import { ActionRetrier, onCompleteValidator } from "@convex-dev/action-retrier";
import { v } from "convex/values";
import { components, internal } from "./_generated/api.js";
import { internalAction, internalMutation, internalQuery } from "./_generated/server.js";

/**
 * Transactional email via Resend (ADR 0008). v1 sends only Welcome + Invitation
 * emails — not activity notifications (PRD 86).
 *
 * Durable handoff uses `emailRetrier` (@convex-dev/action-retrier) — the shared
 * seam EML-2 / FBK-1 reuse. `welcomeSentAt` means *confirmed sent to Resend*
 * (2xx), not merely attempted.
 *
 * Required deployment env vars (Convex deployment env, like auth.ts):
 * RESEND_API_KEY, RESEND_FROM_EMAIL
 */

// Durable handoff to Resend. Welcome email isn't urgent — back off generously.
// initial 30s, ×2 each attempt, up to 5 attempts (~8 min of transient-outage cover) + jitter.
export const emailRetrier = new ActionRetrier(components.actionRetrier, {
  initialBackoffMs: 30_000,
  base: 2,
  maxFailures: 5,
});

export const WELCOME_SUBJECT = "Welcome to Spend Circle";

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

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Resend vendor wiring — single seam for EML-2 / FBK-1. Uses fetch (not SDK). */
export async function sendEmail(args: { to: string; subject: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.error("Resend env not configured; skipping email send");
    return false;
  }
  // fetch can REJECT (DNS/TLS/timeout) before any response — let it propagate so the retrier retries.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
    });
    if (sent) {
      await ctx.runMutation(internal.email.markWelcomed, { userId });
    }
  },
});

export const onWelcomeRunComplete = internalMutation({
  args: onCompleteValidator,
  handler: async (_ctx, { result }) => {
    if (result.type === "failed") {
      console.error("Welcome email exhausted all retries", result.error);
      // TODO(OBS-1): Sentry.captureMessage here.
    }
  },
});
