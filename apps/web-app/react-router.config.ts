import type { Config } from "@react-router/dev/config";

// SPA mode: no server runtime. The build emits a static client bundle with a
// prerendered index.html that Cloudflare Workers serves as the SPA fallback for
// unmatched paths so deep links resolve client-side (ADR 0007, ADR 0017).
export default {
  appDirectory: "app",
  ssr: false,
} satisfies Config;
