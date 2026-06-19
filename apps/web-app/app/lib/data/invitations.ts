import { api } from "@spend-circle/convex";
import { useMutation } from "convex/react";

/**
 * The Create-Invitation mutation (MEM-2), behind the data seam so the route
 * imports no Convex internals. Returns the plaintext token for manual link
 * delivery until EML-2 moves sending server-side.
 */
export function useCreateInvitation() {
  return useMutation(api.invitations.createInvitation);
}
