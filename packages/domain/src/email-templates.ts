function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const WELCOME_SUBJECT = "Welcome to Spend Circle";
export const INVITATION_SUBJECT = "You're invited to join a Spend Circle";

/** Pure HTML builder — no financial content (PRD 84). */
export function welcomeEmail(args: { displayName: string }) {
  const { displayName } = args;
  return {
    subject: WELCOME_SUBJECT,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${WELCOME_SUBJECT}</title></head>
<body>
  <p>Hi ${escapeHtml(displayName)},</p>
  <p>Welcome to Spend Circle — a simple way to track shared spending with the people you trust.</p>
  <p>Your Personal Circle is ready. Open the app to finish setting up your profile and start organizing expenses together.</p>
  <p>— The Spend Circle team</p>
</body>
</html>`,
  };
}

/** Pure HTML builder — no financial content (PRD 84). */
export function invitationEmail(args: {
  inviteLink: string;
  circleName: string;
  ownerDisplayName: string;
  recipientEmail: string;
}) {
  const { inviteLink, circleName, ownerDisplayName, recipientEmail } = args;
  return {
    subject: INVITATION_SUBJECT,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${INVITATION_SUBJECT}</title></head>
<body>
  <p>Hi ${escapeHtml(recipientEmail)},</p>
  <p>${escapeHtml(ownerDisplayName)} has invited you to join the <strong>${escapeHtml(circleName)}</strong> Circle on Spend Circle.</p>
  <p><a href="${escapeHtml(inviteLink)}">Accept the invitation</a></p>
  <p>This link expires in 7 days and can only be used once.</p>
  <p>— The Spend Circle team</p>
</body>
</html>`,
  };
}

/** One source of truth for the preview UI and the template tests — no per-file drift. */
export const EMAIL_PREVIEWS = [
  {
    id: "welcome",
    name: "Welcome",
    fields: [{ key: "displayName", label: "Display name", default: "Ada Lovelace" }],
    render: (p: Record<string, string>) => welcomeEmail({ displayName: p.displayName ?? "" }),
  },
  {
    id: "invitation",
    name: "Invitation",
    fields: [
      { key: "circleName", label: "Circle name", default: "Weekend Trip" },
      { key: "ownerDisplayName", label: "Owner", default: "Ada Lovelace" },
      { key: "recipientEmail", label: "Recipient", default: "grace@example.com" },
      {
        key: "inviteLink",
        label: "Invite link",
        default: "https://app.example.com/invite/sample-token",
      },
    ],
    render: (p: Record<string, string>) =>
      invitationEmail({
        inviteLink: p.inviteLink ?? "",
        circleName: p.circleName ?? "",
        ownerDisplayName: p.ownerDisplayName ?? "",
        recipientEmail: p.recipientEmail ?? "",
      }),
  },
] as const;
