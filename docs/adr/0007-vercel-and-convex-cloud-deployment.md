# Cloudflare Workers static assets and Convex Cloud deployment

Spend Circle v1 deploys the responsive Vite web app to Cloudflare Workers with static assets and the backend to Convex Cloud. Cloudflare is steering new projects toward Workers as the unified platform for static assets and dynamic compute, so using Workers avoids starting on Pages while still keeping static asset serving free and cost-conscious; Vercel remains a strong option for agent experience and framework-native deployments, but this project prioritizes low platform cost before users over Vercel-specific workflow convenience.

Convex uses personal dev deployments for local development and a production deployment deployed from GitHub Actions on main. Automatic per-PR Convex preview deployments are skipped initially to avoid deployment churn and cost complexity; they can be added later if branch-isolated backend testing becomes necessary.
