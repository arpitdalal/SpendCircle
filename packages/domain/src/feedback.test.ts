import {
  FEEDBACK_TYPES,
  feedbackEmail,
  feedbackInputSchema,
  LIMITS,
  parseFeedbackInput,
} from "@spend-circle/domain";
import { describe, expect, it } from "vitest";

describe("feedbackInputSchema", () => {
  it.each(FEEDBACK_TYPES)("accepts type %s with a non-empty message", (type) => {
    expect(feedbackInputSchema.parse({ type, message: "Something helpful" })).toEqual({
      type,
      message: "Something helpful",
    });
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(parseFeedbackInput({ type: "bug", message: "" }).ok).toBe(false);
    expect(parseFeedbackInput({ type: "bug", message: "   " }).ok).toBe(false);
  });

  it("rejects a message over the max length", () => {
    const message = "x".repeat(LIMITS.feedbackMessageMax + 1);
    expect(parseFeedbackInput({ type: "feature", message }).ok).toBe(false);
  });

  it("trims the message on success", () => {
    expect(parseFeedbackInput({ type: "currency", message: "  Add CHF  " })).toEqual({
      ok: true,
      value: { type: "currency", message: "Add CHF" },
    });
  });
});

describe("feedbackEmail", () => {
  it("escapes HTML-special chars in message and metadata fields", () => {
    const { html } = feedbackEmail({
      type: "bug",
      message: "<script>alert(1)</script>\n& more",
      userEmail: "a&b@example.com",
      displayName: 'O"wn',
      appVersion: "1.0.0-beta",
      circleName: "<Trip>",
      circleRef: "trip-c1",
      submittedAtIso: "2026-06-29T12:00:00.000Z",
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("a&amp;b@example.com");
    expect(html).toContain("O&quot;wn");
    expect(html).toContain("&lt;Trip&gt;");
    expect(html).toContain("trip-c1");
    expect(html).toContain("<br>");
  });

  it("omits the circle block when circle context is absent", () => {
    const { html } = feedbackEmail({
      type: "feature",
      message: "Dark mode",
      userEmail: "ada@example.com",
      displayName: "Ada",
      appVersion: "0.1.0",
      submittedAtIso: "2026-06-29T12:00:00.000Z",
    });
    expect(html).not.toContain("<strong>Circle:</strong>");
  });
});
