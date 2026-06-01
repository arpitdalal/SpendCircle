import { Outlet } from "react-router";

/** Layout for unauthenticated surfaces (sign-in, legal, invite landing). */
export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-4">
      <main className="w-full max-w-md">
        <Outlet />
      </main>
    </div>
  );
}
