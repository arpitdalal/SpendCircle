import actionRetrier from "@convex-dev/action-retrier/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";

// Better Auth runs as a Convex component, owning its own auth tables and routes
// (ADR 0002). Action Retrier provides durable action retries for email handoff.
const app = defineApp();
app.use(betterAuth);
app.use(actionRetrier);

export default app;
