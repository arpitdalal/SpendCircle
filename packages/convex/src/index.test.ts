import { describe, expect, it } from "vitest";
import { createSpendCircleBackend, PersonalCircleInvariantError } from "./index";

describe("first sign-in and Personal Circle backend contract", () => {
  it("creates one local User and exactly one always-solo Personal Circle", () => {
    const backend = createSpendCircleBackend();

    const session = backend.signInWithDevGoogle({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      now: "2026-05-27T21:00:00.000Z"
    });

    expect(session.user.googleSubject).toBe("google-123");
    expect(session.circle.name).toBe("Ada's Personal Circle");
    expect(session.circle.kind).toBe("personal");
    expect(session.members).toHaveLength(1);
    expect(backend.visibleCirclesForUser(session.user.id)).toEqual([
      expect.objectContaining({ id: session.circle.id, kind: "personal" })
    ]);

    const secondSession = backend.signInWithDevGoogle({
      googleSubject: "google-123",
      googleAccountEmail: "ada.new@example.com",
      displayName: "Ada L.",
      profilePictureUrl: "https://example.com/ada.png",
      now: "2026-05-27T22:00:00.000Z"
    });

    expect(secondSession.user.id).toBe(session.user.id);
    expect(backend.visibleCirclesForUser(session.user.id)).toHaveLength(1);
  });

  it("renames Personal Circle but rejects membership and lifecycle mutations", () => {
    const backend = createSpendCircleBackend();
    const { user, circle } = backend.signInWithDevGoogle({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      now: "2026-05-27T21:00:00.000Z"
    });

    expect(backend.renameCircle({ actorUserId: user.id, circleId: circle.id, name: "Solo Ledger" }).name).toBe(
      "Solo Ledger"
    );

    expect(() => backend.inviteMember({ actorUserId: user.id, circleId: circle.id })).toThrow(
      PersonalCircleInvariantError
    );
    expect(() => backend.archiveCircle({ actorUserId: user.id, circleId: circle.id })).toThrow(
      PersonalCircleInvariantError
    );
    expect(() => backend.deleteCircle({ actorUserId: user.id, circleId: circle.id })).toThrow(
      PersonalCircleInvariantError
    );
    expect(() => backend.leaveCircle({ actorUserId: user.id, circleId: circle.id })).toThrow(
      PersonalCircleInvariantError
    );
    expect(() =>
      backend.transferOwnership({ actorUserId: user.id, circleId: circle.id, newOwnerUserId: "user-other" })
    ).toThrow(PersonalCircleInvariantError);
  });
});
