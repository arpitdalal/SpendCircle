import { buildRef } from "@spend-circle/domain";
import { describe, expect, it } from "vitest";
import {
  scrubAppErrorExtra,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubUrlForSentry,
} from "./sentry-scrub.js";

const txnRef = buildRef("Weekly grocery shop", "t1abc");
const circleRef = buildRef("Family Trip", "c1abc");

describe("scrubUrlForSentry", () => {
  it("redacts title-bearing transaction and circle refs in the path", () => {
    const scrubbed = scrubUrlForSentry(
      `http://127.0.0.1:5173/circles/${circleRef}/transactions/${txnRef}/edit`,
    );

    expect(scrubbed).not.toContain("weekly-grocery-shop");
    expect(scrubbed).not.toContain("family-trip");
    expect(scrubbed).toContain("/circles/c1abc/transactions/t1abc/");
  });

  it("keeps static route segments intact", () => {
    expect(scrubUrlForSentry("/circles/c1abc/transactions/new")).toBe(
      "/circles/c1abc/transactions/new",
    );
  });
});

describe("scrubAppErrorExtra", () => {
  it("redacts rawRef slugs and drops financial keys", () => {
    expect(
      scrubAppErrorExtra({
        rawRef: txnRef,
        title: "Weekly grocery shop",
        amountMinorUnits: 1299,
      }),
    ).toEqual({
      rawRef: "t1abc",
    });
  });

  it("redacts unparseable hyphenated rawRef values", () => {
    expect(scrubAppErrorExtra({ rawRef: "grocery-shopping-bad!" })).toEqual({
      rawRef: "[unparseable-ref]",
    });
  });
});

describe("scrubSentryEvent", () => {
  it("scrubs request URLs, breadcrumbs, and extras before send", () => {
    const event = {
      type: undefined,
      request: {
        url: `http://127.0.0.1:5173/circles/${circleRef}/transactions/${txnRef}`,
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: {
            from: `/circles/${circleRef}`,
            to: `/circles/${circleRef}/transactions/${txnRef}`,
          },
        },
      ],
      extra: { rawRef: txnRef, note: "paid in cash" },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.url).not.toContain("weekly-grocery-shop");
    expect(scrubbed.request?.url).toContain("/circles/c1abc/transactions/t1abc");
    expect(scrubbed.breadcrumbs?.[0]?.data?.from).toBe("/circles/c1abc");
    expect(scrubbed.breadcrumbs?.[0]?.data?.to).toBe("/circles/c1abc/transactions/t1abc");
    expect(scrubbed.extra).toEqual({ rawRef: "t1abc" });
  });
});

describe("scrubSentryBreadcrumb", () => {
  it("scrubs navigation breadcrumb URLs", () => {
    const scrubbed = scrubSentryBreadcrumb({
      category: "navigation",
      data: { to: `/circles/${circleRef}/transactions/${txnRef}` },
    });

    expect(scrubbed.data?.to).toBe("/circles/c1abc/transactions/t1abc");
  });
});
