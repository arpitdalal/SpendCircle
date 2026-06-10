/** Full-page splash shown while auth or a route guard resolves (ADR 0017). The
 * concentric-ring glyph is the app's circle motif; the outer ring spins as the
 * progress cue (reduced motion collapses it to a static mark via the global rule). */
export function Splash({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <span className="relative flex size-10 items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <span className="size-4 rounded-full border-2 border-primary/50" />
        </span>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
