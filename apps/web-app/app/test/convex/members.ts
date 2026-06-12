import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Member } from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";
import { testId } from "./ids.js";

export interface MembersState {
  /** `listMembers` — `undefined` ≡ loading, `null` ≡ inaccessible. */
  members?: Member[] | null;
}

export function membersDouble(state: MembersState): EntityDouble {
  const { members } = state;
  return {
    queries: {
      [getFunctionName(api.members.listMembers)]: () => members,
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
