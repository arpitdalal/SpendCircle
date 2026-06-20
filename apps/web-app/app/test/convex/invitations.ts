import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Mock } from "vitest";
import type { PendingInvitation } from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";

export interface InvitationsState {
  /** `invitations:createInvitation` mock; unset ⇒ no-op. */
  createInvitation?: Mock;
  /** `invitations:listPendingInvitations` return; unset ⇒ []. */
  pendingInvitations?: PendingInvitation[] | null;
  /** `invitations:resendInvitation` mock; unset ⇒ no-op. */
  resendInvitation?: Mock;
  /** `invitations:revokeInvitation` mock; unset ⇒ no-op. */
  revokeInvitation?: Mock;
}

export function invitationsDouble(state: InvitationsState): EntityDouble {
  const { createInvitation, pendingInvitations, resendInvitation, revokeInvitation } = state;
  return {
    queries: {
      [getFunctionName(api.invitations.listPendingInvitations)]: () => pendingInvitations,
    },
    mutations: {
      [getFunctionName(api.invitations.createInvitation)]: createInvitation,
      [getFunctionName(api.invitations.resendInvitation)]: resendInvitation,
      [getFunctionName(api.invitations.revokeInvitation)]: revokeInvitation,
    },
  };
}
