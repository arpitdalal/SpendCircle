import { describe, expect, it } from "vitest";
import type { Member } from "~/lib/data.js";
import { makeMemberView, testId } from "~/test/convex-react.js";
import { resolvePaidBy } from "./resolve-paid-by.js";

describe("resolvePaidBy", () => {
  it("returns undefined memberId when selection is empty", () => {
    const members = [makeMemberView()];
    expect(resolvePaidBy("", members)).toEqual({ ok: true, memberId: undefined });
  });

  it("resolves to the matching current member id", () => {
    const id = testId<Member["id"]>("m1");
    const members = [makeMemberView({ id, displayName: "A", isSelf: false })];
    expect(resolvePaidBy(id, members)).toEqual({ ok: true, memberId: id });
  });

  it("allows unchanged existing Paid By when that member is no longer in the list", () => {
    const current = testId<Member["id"]>("gone");
    const members = [makeMemberView({ id: testId<Member["id"]>("m1"), isSelf: false })];
    expect(resolvePaidBy(current, members, current)).toEqual({ ok: true, memberId: current });
  });

  it("fails when a non-empty selection is stale and not the saved Paid By", () => {
    const members = [makeMemberView({ id: testId<Member["id"]>("m1"), isSelf: false })];
    expect(resolvePaidBy(testId<Member["id"]>("missing"), members)).toEqual({ ok: false });
  });
});
