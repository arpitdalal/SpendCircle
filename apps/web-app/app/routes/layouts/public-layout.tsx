import { Outlet } from "react-router";

/** Layout for unauthenticated surfaces (sign-in, legal, invite landing). The soft
 * radial iris glow is decorative atmosphere only — content sits in a centered card. */
export default function PublicLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <main className="relative w-full max-w-md animate-slide-up">
        <Outlet />
      </main>
    </div>
  );
}
