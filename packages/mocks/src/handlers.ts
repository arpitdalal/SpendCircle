import { http, HttpResponse } from "msw";

/**
 * First-party MSW handlers for the *outbound third-party vendor APIs* Spend
 * Circle talks to: Resend (email), PostHog (analytics), and Sentry (errors).
 *
 * These deliberately do NOT mock the Google OAuth redirect flow — identity in
 * mock mode is handled by the dev-only auth bypass, not MSW (ADR 0006). Handlers
 * capture request payloads so tests can assert vendor payload shape (e.g.
 * Feedback email contents, absence of financial content in analytics) without
 * anything escaping to real vendors.
 */
export interface CapturedRequest {
  vendor: "resend" | "posthog" | "sentry";
  url: string;
  body: unknown;
}

/** In-memory log of intercepted vendor calls, for assertions in tests. */
export const capturedRequests: CapturedRequest[] = [];

export function resetCapturedRequests(): void {
  capturedRequests.length = 0;
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

export const handlers = [
  // Resend — transactional email (ADR 0008): Welcome + Invitation + Feedback.
  http.post("https://api.resend.com/emails", async ({ request }) => {
    capturedRequests.push({
      vendor: "resend",
      url: request.url,
      body: await safeJson(request),
    });
    return HttpResponse.json({ id: "mock-email-id" }, { status: 200 });
  }),

  // PostHog — product analytics (ADR 0013). Catches both capture and batch.
  http.post("https://*.posthog.com/*", async ({ request }) => {
    capturedRequests.push({
      vendor: "posthog",
      url: request.url,
      body: await safeJson(request),
    });
    return HttpResponse.json({ status: 1 }, { status: 200 });
  }),

  // Sentry — error monitoring envelopes (ADR 0012).
  http.post("https://*.ingest.sentry.io/*", async ({ request }) => {
    capturedRequests.push({
      vendor: "sentry",
      url: request.url,
      body: await request.clone().text(),
    });
    return HttpResponse.json({ id: "mock-event-id" }, { status: 200 });
  }),
];
