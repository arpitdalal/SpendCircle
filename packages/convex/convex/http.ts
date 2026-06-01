import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth.js";

// Mounts the Better Auth HTTP routes (e.g. /api/auth/callback/google) on this
// deployment's site URL (ADR 0002). SPA mode has no app server, so auth is
// served entirely by Convex.
const http = httpRouter();
// `cors: true` makes the auth routes emit Access-Control-* headers for the app
// origin (the SPA runs on a different origin than this *.convex.site deployment).
// Allowed origins are derived from Better Auth's trustedOrigins (see auth.ts).
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
