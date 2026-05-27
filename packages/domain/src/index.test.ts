import { describe, expect, it } from "vitest";
import { createInitialUserProfile, LEGAL_VERSIONS } from "./index";

describe("first sign-in profile", () => {
  it("stores Google identity, profile fallback, and legal acceptance", () => {
    const profile = createInitialUserProfile({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      acceptedAt: "2026-05-27T21:00:00.000Z"
    });

    expect(profile).toEqual({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: "initials:A",
      acceptedTermsVersion: LEGAL_VERSIONS.terms,
      acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
      acceptedAt: "2026-05-27T21:00:00.000Z"
    });
  });
});
