import {
  type AuthFunctions,
  BetterAuth,
  type PublicAuthFunctions,
  convexAdapter,
} from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { api, components, internal } from "./_generated/api.js";
import type { DataModel, Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { createUserWithPersonalCircle, propagateUserProfile } from "./model.js";

/**
 * Better Auth + Convex wiring (ADR 0002). Auth runs as a Convex component; this
 * deployment hosts the auth routes and mints a Convex JWT (the `convex` plugin).
 * The web app is a separate origin (SPA on the app domain), so the
 * `crossDomain` plugin trusts the app's SITE_URL.
 *
 * Required deployment env vars: SITE_URL (the app origin), GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET. CONVEX_SITE_URL is provided by
 * Convex automatically and is where the auth routes live.
 */
type AuthCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
  | GenericActionCtx<DataModel>;

const authFunctions = internal.auth as unknown as AuthFunctions;
const publicAuthFunctions = api.auth as unknown as PublicAuthFunctions;

export const authComponent = new BetterAuth(components.betterAuth, {
  authFunctions,
  publicAuthFunctions,
  verbose: true,
});

// Component trigger functions. `onCreateUser` runs in the OAuth callback and
// creates the Spend Circle User + Personal Circle (PRD stories 1, 3), returning
// the app user id the component stores as the auth-user mapping. `onUpdateUser`
// is the single propagation path for the materialized member identity (ADR
// 0018): when a User's Google profile (name/image) changes, `propagateUserProfile`
// mirrors it onto the User row and that User's ACTIVE member rows, leaving removed
// rows frozen. This is the one place that maintains member.displayName/image.
export const { createUser, updateUser, deleteUser, createSession, isAuthenticated } =
  authComponent.createAuthFunctions<DataModel>({
    onCreateUser: async (ctx, authUser) => {
      return await createUserWithPersonalCircle(ctx, {
        email: authUser.email,
        displayName: authUser.name,
        image: authUser.image ?? undefined,
      });
    },
    onUpdateUser: async (ctx, authUser) => {
      if (!authUser.userId) {
        return;
      }
      await propagateUserProfile(ctx, authUser.userId as Id<"users">, {
        displayName: authUser.name,
        image: authUser.image ?? undefined,
      });
    },
  });

const siteUrl = process.env.SITE_URL ?? "http://127.0.0.1:5173";

// Local dev is reachable as both 127.0.0.1 and localhost; trust both so the
// CORS allow-origin and post-auth redirect work regardless of which the browser
// uses. In production this collapses to the single SITE_URL.
const trustedOrigins = Array.from(
  new Set([siteUrl, "http://127.0.0.1:5173", "http://localhost:5173"]),
);

export const createAuth = (ctx: AuthCtx) =>
  betterAuth({
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins,
    database: convexAdapter(ctx, authComponent),
    account: { accountLinking: { enabled: true } },
    // Google-only sign-in (ADR 0002).
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    plugins: [convex(), crossDomain({ siteUrl })],
  });

/** The Spend Circle User for the current auth identity, or null. */
export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const authUser = await authComponent.getAuthUser(ctx).catch(() => null);
  if (!authUser?.userId) {
    return null;
  }
  return await ctx.db.get(authUser.userId as Id<"users">);
}

/** Throws unless the request is from a bootstrapped Spend Circle User. */
export async function requireCurrentUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
