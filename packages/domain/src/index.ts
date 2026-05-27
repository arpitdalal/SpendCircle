export const LEGAL_VERSIONS = {
  terms: "2026-05-27",
  privacy: "2026-05-27"
} as const;

export type GoogleIdentityInput = {
  googleSubject: string;
  googleAccountEmail: string;
  displayName: string;
  profilePictureUrl?: string | null;
  acceptedAt: string;
};

export type UserProfile = {
  googleSubject: string;
  googleAccountEmail: string;
  displayName: string;
  profilePictureUrl: string;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  acceptedAt: string;
};

export function createInitialUserProfile(input: GoogleIdentityInput): UserProfile {
  const displayName = input.displayName.trim();
  const fallbackInitial = displayName.at(0)?.toUpperCase() ?? "U";

  return {
    googleSubject: input.googleSubject,
    googleAccountEmail: input.googleAccountEmail,
    displayName,
    profilePictureUrl: input.profilePictureUrl ?? `initials:${fallbackInitial}`,
    acceptedTermsVersion: LEGAL_VERSIONS.terms,
    acceptedPrivacyVersion: LEGAL_VERSIONS.privacy,
    acceptedAt: input.acceptedAt
  };
}
