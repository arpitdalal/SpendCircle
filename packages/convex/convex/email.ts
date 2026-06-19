import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import { internalAction, internalMutation } from "./_generated/server.js";

/**
 * Transactional email via Resend (ADR 0008). v1 sends only Welcome + Invitation
 * emails — not activity notifications (PRD 86).
 *
 * Required deployment env vars (Convex deployment env, like auth.ts):
 * RESEND_API_KEY, RESEND_FROM_EMAIL
 */

export const WELCOME_SUBJECT = "Welcome to Spend Circle";

/** Pure HTML builder — no financial content (PRD 84). */
export function welcomeHtml(displayName: string): string {
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

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Resend vendor wiring — single seam for EML-2 / FBK-1. Uses fetch (not SDK). */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) {
    console.error("Resend env not configured; skipping email send");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
  });
  if (!res.ok) {
    console.error("Resend send failed", res.status, await res.text().catch(() => ""));
  }
}

/** Idempotent claim: returns the user payload to send to ONCE, else null. */
export const claimWelcome = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.welcomeSentAt !== undefined) {
      return null;
    }
    await ctx.db.patch(userId, { welcomeSentAt: Date.now() });
    return { email: user.email, displayName: user.displayName };
  },
});

export const sendWelcomeEmail = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const claimed = await ctx.runMutation(internal.email.claimWelcome, { userId });
    if (!claimed) {
      return;
    }
    await sendEmail({
      to: claimed.email,
      subject: WELCOME_SUBJECT,
      html: welcomeHtml(claimed.displayName),
    });
  },
});
