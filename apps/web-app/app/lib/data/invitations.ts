import { api } from "@spend-circle/convex";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "../env.js";
import { MOCK_INVITATION_PREVIEW } from "../fixtures.js";

/**
 * The Create-Invitation mutation (MEM-2), behind the data seam so the route
 * imports no Convex internals. Returns the plaintext token for manual link
 * delivery until EML-2 moves sending server-side.
 */
export function useCreateInvitation() {
  return useMutation(api.invitations.createInvitation);
}

export function useAcceptInvitation() {
  return useMutation(api.invitations.acceptInvitation);
}

export type InvitationPreview = NonNullable<
  FunctionReturnType<typeof api.invitations.getInvitationPreview>
>;

export function useInvitationPreview(
  token: string | undefined,
): InvitationPreview | null | undefined {
  const queried = useQuery(
    api.invitations.getInvitationPreview,
    MOCKS || !token ? "skip" : { token },
  );
  return MOCKS ? MOCK_INVITATION_PREVIEW : queried;
}
