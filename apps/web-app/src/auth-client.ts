import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authBaseURL = import.meta.env.VITE_CONVEX_SITE_URL
  ? `${import.meta.env.VITE_CONVEX_SITE_URL}/api/auth`
  : undefined;

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [convexClient(), crossDomainClient()]
});
