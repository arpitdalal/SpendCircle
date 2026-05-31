/** Full-page splash shown while auth or a route guard resolves (ADR 0017). */
export function Splash({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950">
      <div className="flex flex-col items-center gap-3 text-neutral-400">
        <div className="size-6 animate-spin rounded-full border-2 border-neutral-600 border-t-neutral-200" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
