import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";

// Better Auth runs as a Convex component, owning its own auth tables and routes
// (ADR 0002). The app schema references users by the auth subject.
const app = defineApp();
app.use(betterAuth);

export default app;
