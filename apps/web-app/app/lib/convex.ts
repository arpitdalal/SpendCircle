import { ConvexReactClient } from "convex/react";
import { CONVEX_URL } from "./env.js";

/** Single Convex client for the app; the reactive data layer (ADR 0001). */
export const convex = new ConvexReactClient(CONVEX_URL);
