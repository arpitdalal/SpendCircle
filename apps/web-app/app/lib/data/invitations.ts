import { api } from "@spend-circle/convex";
import { useMutation } from "convex/react";

/**
 * The Create-Invitation mutation (MEM-2), behind the data seam so the route
 * imports no Convex internals. Server-side email delivery is enqueued by the
 * mutation (EML-2); the client receives no plaintext token.
 */
export function useCreateInvitation() {
  return useMutation(api.invitations.createInvitation);
}
