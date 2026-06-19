import { describe, expect, it } from "vitest";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";

describe("invitationToken", () => {
  it("generates unique tokens across calls", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    expect(a).not.toBe(b);
  });

  it("hashes deterministically for a given token", async () => {
    const token = "test-token-value";
    const hash1 = await hashInvitationToken(token);
    const hash2 = await hashInvitationToken(token);
    expect(hash1).toBe(hash2);
  });

  it("never equals the plaintext token", async () => {
    const token = generateInvitationToken();
    const hash = await hashInvitationToken(token);
    expect(hash).not.toBe(token);
  });
});
