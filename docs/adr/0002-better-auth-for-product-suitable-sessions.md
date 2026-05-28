# Better Auth with Google-only sign-in

Spend Circle uses Better Auth with Convex for Google-only sign-in in v1. Clerk's Hobby session limits are a poor fit for habit-based transaction logging, custom email/password auth would create unnecessary security and maintenance burden, and Google sign-in provides verified email, display name, and profile picture without adding password reset or email verification flows; Circle membership and Invitations remain owned by Convex instead of an auth-provider organization model.
