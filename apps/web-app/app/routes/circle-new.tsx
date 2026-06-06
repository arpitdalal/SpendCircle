import {
  buildRef,
  COLOR_PALETTE,
  circleInputSchema,
  colorLabel,
  DEFAULT_COLOR_ID,
  defaultCurrencyForLocale,
  initials,
  LIMITS,
  SUPPORTED_CURRENCIES,
} from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { href, Link, useNavigate } from "react-router";
import { CircleMark } from "~/components/circle-mark.js";
import { Button } from "~/components/ui/button.js";
import { useCreateCircle } from "~/lib/data.js";
import { viewerLocale } from "~/lib/locale.js";
import { useSnackbar } from "~/lib/snackbar.js";
import { cn } from "~/lib/utils.js";

/**
 * Create a regular Circle (CS-0; PRD stories 6, 10, 11). Name (required) plus a
 * Currency, a Color, and an auto-derived Circle Mark:
 *
 * - Currency defaults from the viewer's locale with a USD fallback via the shared
 *   domain helper (CONTEXT: Currency) — never hardcoded USD in the UI — and is
 *   chosen from `SUPPORTED_CURRENCIES`.
 * - Color is a palette pick (PRD 11), defaulting to the app's default color.
 * - The Mark is derived from the name's initials and shown live in a preview; it is
 *   not an editable field here (editing the Mark/Color after creation is CS-2).
 *
 * Names may duplicate by design (PRD 10), so the form NEVER blocks on a name
 * collision — identity is the Mark + Color + ref, not the name. On submit it calls
 * `createCircle`, then navigates to the new Circle's canonical `slug-id` ref
 * (`buildRef`, ADR 0016) so the URL is canonical from creation, and offers to set
 * the Circle up next (CS-1). The server re-validates every field (ADR 0015); this
 * mirrors the shared `circleInputSchema` for inline feedback.
 */
export default function CreateCircle() {
  const navigate = useNavigate();
  const createCircle = useCreateCircle();
  const { show } = useSnackbar();

  const [name, setName] = useState("");
  // Locale-derived default (USD fallback) computed once on mount, not hardcoded. Held
  // as a plain string (the <select> writes back any option value); the shared schema
  // narrows it to a SUPPORTED_CURRENCIES code at submit and the server re-validates.
  const [currency, setCurrency] = useState<string>(() => defaultCurrencyForLocale(viewerLocale()));
  const [color, setColor] = useState<string>(DEFAULT_COLOR_ID);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The Mark is always derived from the current name's initials (CONTEXT: Circle
  // Mark); "?" until a name is typed, mirroring the domain `initials` fallback.
  const mark = initials(name);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client mirror of the shared schema (the server re-validates — ADR 0015). The
    // Mark rides along already derived; only the name can realistically fail here.
    const parsed = circleInputSchema.safeParse({ name, currency, color, mark });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the circle details.");
      return;
    }

    setSubmitting(true);
    try {
      const circleId = await createCircle({
        name: parsed.data.name,
        currency: parsed.data.currency,
        color: parsed.data.color,
        mark: parsed.data.mark,
      });
      // Navigate to the canonical ref so the URL is id-authoritative from the first
      // load — no stale-slug redirect (ADR 0016). `buildRef` takes the name + the new
      // id; the branded id flows through unchanged (no cast).
      const ref = buildRef(parsed.data.name, circleId);
      await navigate(href("/circles/:circleRef", { circleRef: ref }));
      // Offer to set the Circle up next (Circle Setup is CS-1); for now point the
      // User at the Categories surface that exists today.
      show(`"${parsed.data.name}" created. Add categories to set it up.`);
    } catch (caught) {
      // Names duplicate by design, so there is no expected "already exists" rejection
      // to mirror; anything thrown is unexpected — surface it (Sentry once it lands,
      // ADR 0012) rather than swallow it, and show a generic retry message.
      console.error("createCircle failed", caught);
      setError("Couldn't create the circle. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Create a circle</h1>
        <p className="text-sm text-neutral-500">
          A shared space to track money with others. You can invite people and set it up after.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-neutral-800 p-4">
        <div className="flex items-center gap-3">
          {/* Live Mark preview: the derived initials tinted with the chosen Color. */}
          <CircleMark mark={mark} color={color} className="size-12 text-base" />
          <p className="text-xs text-neutral-500">
            The mark is made from your circle’s initials and color.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="circle-name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="circle-name"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            maxLength={LIMITS.circleNameMax}
            placeholder="e.g. Home, Trip to Japan"
            autoComplete="off"
            aria-invalid={error != null}
            aria-describedby={error ? "circle-error" : undefined}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="circle-currency" className="block text-sm font-medium">
            Currency
          </label>
          <select
            id="circle-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
          >
            {SUPPORTED_CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} · {option.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-500">
            Every transaction in this circle uses this currency. It locks once the circle has
            transactions.
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_PALETTE.map((paletteColor) => (
              <button
                key={paletteColor.id}
                type="button"
                aria-label={paletteColor.name}
                aria-pressed={color === paletteColor.id}
                onClick={() => setColor(paletteColor.id)}
                style={{ backgroundColor: paletteColor.hex }}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-neutral-900 transition",
                  color === paletteColor.id ? "ring-2 ring-neutral-100" : "ring-0",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-500">{colorLabel(color)}</p>
        </fieldset>

        {error ? (
          <p id="circle-error" role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={submitting || name.trim() === ""}>
            {submitting ? "Creating…" : "Create circle"}
          </Button>
          <Button asChild variant="ghost" disabled={submitting}>
            <Link to={href("/")}>Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
