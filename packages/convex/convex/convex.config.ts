import betterAuth from "@convex-dev/better-auth/convex.config";
import workpool from "@convex-dev/workpool/convex.config.js";
import { defineApp } from "convex/server";

// Better Auth runs as a Convex component (ADR 0002). Workpool gives the email
// handoff bounded-concurrency retries — one throttled pool shared by all
// transactional email (welcome / invitation / feedback) so a Resend outage
// can't stampede the vendor or trip its rate limits.
const app = defineApp();
app.use(betterAuth);
app.use(workpool, { name: "emailWorkpool" });

export default app;
