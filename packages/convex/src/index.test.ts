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

describe("regular Circle creation", () => {
  it("creates duplicate-named regular Circles with Owner Member, color, mark, Currency, and starter Categories", () => {
    const backend = createSpendCircleBackend();
    const { user } = backend.signInWithDevGoogle({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      now: "2026-05-27T21:00:00.000Z"
    });

    const firstCircle = backend.createRegularCircle({
      actorUserId: user.id,
      name: "Home",
      locale: "en-CA",
      setup: { residenceType: "leased" }
    });
    const secondCircle = backend.createRegularCircle({
      actorUserId: user.id,
      name: "Home",
      locale: "en-US",
      setup: {}
    });

    expect(firstCircle.circle).toEqual(
      expect.objectContaining({
        kind: "regular",
        name: "Home",
        currency: "CAD",
        mark: "H"
      })
    );
    expect(firstCircle.circle.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(firstCircle.members).toEqual([
      expect.objectContaining({ userId: user.id, circleId: firstCircle.circle.id, role: "owner" })
    ]);
    expect(firstCircle.categories).toEqual([
      expect.objectContaining({ name: "Rent", type: "expense" }),
      expect.objectContaining({ name: "Groceries", type: "expense" }),
      expect.objectContaining({ name: "Paycheck", type: "income" })
    ]);
    expect(secondCircle.circle.name).toBe("Home");
    expect(secondCircle.circle.id).not.toBe(firstCircle.circle.id);
    expect(backend.visibleCirclesForUser(user.id).map((circle) => circle.name)).toEqual([
      "Ada's Personal Circle",
      "Home",
      "Home"
    ]);
  });

  it("validates Currency server-side, allows Owner edits before Transactions, and rejects non-members", () => {
    const backend = createSpendCircleBackend();
    const { user } = backend.signInWithDevGoogle({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      now: "2026-05-27T21:00:00.000Z"
    });
    const { user: otherUser } = backend.signInWithDevGoogle({
      googleSubject: "google-456",
      googleAccountEmail: "grace@example.com",
      displayName: "Grace Hopper",
      profilePictureUrl: null,
      now: "2026-05-27T21:05:00.000Z"
    });
    const { circle } = backend.createRegularCircle({
      actorUserId: user.id,
      name: "Trip",
      locale: "en-US",
      setup: {}
    });

    expect(() =>
      backend.createRegularCircle({ actorUserId: user.id, name: "Invalid", locale: "en-US", currency: "EUR", setup: {} })
    ).toThrow("Unsupported Currency.");
    expect(backend.updateCircleCurrency({ actorUserId: user.id, circleId: circle.id, currency: "CAD" }).currency).toBe(
      "CAD"
    );
    expect(() =>
      backend.updateCircleCurrency({ actorUserId: otherUser.id, circleId: circle.id, currency: "USD" })
    ).toThrow("Circle not visible.");

    backend.recordTransactionForTest({ circleId: circle.id });

    expect(() => backend.updateCircleCurrency({ actorUserId: user.id, circleId: circle.id, currency: "USD" })).toThrow(
      "Currency is locked after the first Transaction."
    );
  });
});
