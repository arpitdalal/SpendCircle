import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Mock } from "vitest";
import type { EntityDouble } from "./contract.js";

export interface InvitationsState {
  /** `invitations:createInvitation` mock; unset ⇒ no-op. */
  createInvitation?: Mock;
}

export function invitationsDouble(state: InvitationsState): EntityDouble {
  const { createInvitation } = state;
  return {
    mutations: {
      [getFunctionName(api.invitations.createInvitation)]: createInvitation,
    },
  };
}
