import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Mock } from "vitest";
import type { InvitationPreview } from "~/lib/data/invitations.js";
import type { EntityDouble } from "./contract.js";
import { resolveWith } from "./contract.js";

export interface InvitationsState {
  /** `invitations:createInvitation` mock; unset ⇒ no-op. */
  createInvitation?: Mock;
  /** `invitations:acceptInvitation` mock; unset ⇒ no-op. */
  acceptInvitation?: Mock;
  /** `invitations:getInvitationPreview` — `undefined` ≡ loading, `null` ≡ invalid. */
  invitationPreview?:
    | InvitationPreview
    | null
    | ((args: Record<string, unknown>) => InvitationPreview | null | undefined);
}

export function invitationsDouble(state: InvitationsState): EntityDouble {
  const { createInvitation, acceptInvitation, invitationPreview } = state;
  return {
    queries: {
      [getFunctionName(api.invitations.getInvitationPreview)]: (args) =>
        resolveWith(invitationPreview, args),
    },
    mutations: {
      [getFunctionName(api.invitations.createInvitation)]: createInvitation,
      [getFunctionName(api.invitations.acceptInvitation)]: acceptInvitation,
    },
  };
}
