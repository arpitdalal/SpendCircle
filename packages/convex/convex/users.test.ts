import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("Convex first sign-in and Personal Circle", () => {
  it("persists Google identity, legal acceptance, and exactly one Personal Circle", async () => {
    const t = convexTest(schema, modules);

    const first = await t.mutation(api.users.completeDevSignIn, {
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      acceptedAt: "2026-05-27T21:00:00.000Z"
    });

    expect(first.user).toMatchObject({
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: "initials:A",
      acceptedTermsVersion: "2026-05-27",
      acceptedPrivacyVersion: "2026-05-27",
      acceptedAt: "2026-05-27T21:00:00.000Z"
    });
    expect(first.circle).toMatchObject({
      kind: "personal",
      name: "Ada's Personal Circle",
      mark: "PC"
    });

    const second = await t.mutation(api.users.completeDevSignIn, {
      googleSubject: "google-123",
      googleAccountEmail: "ada.new@example.com",
      displayName: "Ada L.",
      profilePictureUrl: "https://example.com/ada.png",
      acceptedAt: "2026-05-27T22:00:00.000Z"
    });
    const circles = await t.query(api.circles.listVisible, { userId: first.user._id });

    expect(second.user._id).toBe(first.user._id);
    expect(circles).toHaveLength(1);
    expect(circles[0]).toMatchObject({ _id: first.circle._id, kind: "personal" });
  });

  it("renames Personal Circle and rejects server-side invariant failures", async () => {
    const t = convexTest(schema, modules);
    const { user, circle } = await t.mutation(api.users.completeDevSignIn, {
      googleSubject: "google-123",
      googleAccountEmail: "ada@example.com",
      displayName: "Ada Lovelace",
      profilePictureUrl: null,
      acceptedAt: "2026-05-27T21:00:00.000Z"
    });

    const renamed = await t.mutation(api.circles.rename, {
      actorUserId: user._id,
      circleId: circle._id,
      name: "Solo Ledger"
    });

    expect(renamed?.name).toBe("Solo Ledger");
    await expect(t.mutation(api.circles.inviteMember, { actorUserId: user._id, circleId: circle._id })).rejects.toThrow(
      "Personal Circle cannot invite Members."
    );
    await expect(t.mutation(api.circles.archiveCircle, { actorUserId: user._id, circleId: circle._id })).rejects.toThrow(
      "Personal Circle cannot be archived."
    );
    await expect(t.mutation(api.circles.deleteCircle, { actorUserId: user._id, circleId: circle._id })).rejects.toThrow(
      "Personal Circle cannot be deleted."
    );
    await expect(t.mutation(api.circles.leaveCircle, { actorUserId: user._id, circleId: circle._id })).rejects.toThrow(
      "Personal Circle cannot be left."
    );
    await expect(
      t.mutation(api.circles.transferOwnership, {
        actorUserId: user._id,
        circleId: circle._id,
        newOwnerUserId: user._id
      })
    ).rejects.toThrow("Personal Circle cannot transfer ownership.");
  });
});
