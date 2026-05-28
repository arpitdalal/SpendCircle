import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { crossDomain } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    appName: "Spend Circle",
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        prompt: "select_account"
      }
    },
    plugins: [convex({ authConfig }), crossDomain({ siteUrl: process.env.SITE_URL ?? "" })]
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
