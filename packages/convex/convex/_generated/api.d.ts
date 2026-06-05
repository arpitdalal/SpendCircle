/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as categories from "../categories.js";
import type * as circles from "../circles.js";
import type * as dashboard from "../dashboard.js";
import type * as guard from "../guard.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as ledger from "../ledger.js";
import type * as members from "../members.js";
import type * as model from "../model.js";
import type * as monthActivity from "../monthActivity.js";
import type * as test_seed from "../test/seed.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  categories: typeof categories;
  circles: typeof circles;
  dashboard: typeof dashboard;
  guard: typeof guard;
  history: typeof history;
  http: typeof http;
  ledger: typeof ledger;
  members: typeof members;
  model: typeof model;
  monthActivity: typeof monthActivity;
  "test/seed": typeof test_seed;
  transactions: typeof transactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
