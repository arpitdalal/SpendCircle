import type { AuthConfig } from "convex/server";

// Convex auth configuration: trust tokens minted by the Better Auth component
// hosted on this deployment's site URL.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL ?? "",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
