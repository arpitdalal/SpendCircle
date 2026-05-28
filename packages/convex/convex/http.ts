import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, {
  cors: {
    allowedOrigins: [process.env.SITE_URL ?? "http://127.0.0.1:5173"],
    allowedHeaders: ["Content-Type", "Better-Auth-Cookie"],
    exposedHeaders: ["set-better-auth-cookie"]
  }
});

export default http;
