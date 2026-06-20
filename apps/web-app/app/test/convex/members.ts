import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Mock } from "vitest";
import type { Member } from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";
import { testId } from "./ids.js";

export interface MembersState {
  /** `listMembers` — `undefined` ≡ loading, `null` ≡ inaccessible. */
  members?: Member[] | null;
  removeMember?: Mock;
}

export function membersDouble(state: MembersState): EntityDouble {
  const { members, removeMember } = state;
  return {
    queries: {
      [getFunctionName(api.members.listMembers)]: () => members,
    },
    mutations: {
      [getFunctionName(api.members.removeMember)]: removeMember,
    },
  };
}

export function makeMemberView(over: Partial<Member> = {}): Member {
  return {
    id: testId<Member["id"]>("mem-you"),
    displayName: "You",
    image: undefined,
    role: "owner",
    status: "active",
    joinedAt: 0,
    isSelf: true,
    ...over,
  };
}
