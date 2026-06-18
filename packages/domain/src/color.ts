/**
 * Color palettes for Circle Color/Mark and Category Color. Colors are a visual
 * cue, not identity: collisions are allowed (PRD stories 11, 60), so these are
 * just curated, accessible-on-dark choices rather than a uniqueness constraint.
 */
export interface PaletteColor {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

export const COLOR_PALETTE = [
  { id: "slate", name: "Slate", hex: "#64748b" },
  { id: "red", name: "Red", hex: "#ef4444" },
  { id: "orange", name: "Orange", hex: "#f97316" },
  { id: "amber", name: "Amber", hex: "#f59e0b" },
  { id: "green", name: "Green", hex: "#22c55e" },
  { id: "teal", name: "Teal", hex: "#14b8a6" },
  { id: "sky", name: "Sky", hex: "#0ea5e9" },
  { id: "blue", name: "Blue", hex: "#3b82f6" },
  { id: "indigo", name: "Indigo", hex: "#6366f1" },
  { id: "violet", name: "Violet", hex: "#8b5cf6" },
  { id: "pink", name: "Pink", hex: "#ec4899" },
  { id: "rose", name: "Rose", hex: "#f43f5e" },
] as const satisfies readonly PaletteColor[];

export type ColorId = (typeof COLOR_PALETTE)[number]["id"];

const COLOR_IDS = new Set<string>(COLOR_PALETTE.map((color) => color.id));

const COLOR_NAMES = new Map<string, string>(COLOR_PALETTE.map((color) => [color.id, color.name]));

const COLOR_HEXES = new Map<string, string>(COLOR_PALETTE.map((color) => [color.id, color.hex]));

export function isValidColorId(id: string): id is ColorId {
  return COLOR_IDS.has(id);
}

export const DEFAULT_COLOR_ID: ColorId = "blue";

/**
 * Reserved for Personal Circles only — not in {@link COLOR_PALETTE}, so no
 * regular Circle can pick it. Matches the app iris accent (`app.css` `--primary`:
 * oklch(0.63 0.2 295)).
 */
export const PERSONAL_CIRCLE_COLOR_ID = "iris";
export const PERSONAL_CIRCLE_COLOR_HEX = "#9470f5";

export function isPersonalCircleColorId(id: string): boolean {
  return id === PERSONAL_CIRCLE_COLOR_ID;
}

/**
 * The human-readable name for a palette color id ("blue" → "Blue"). Used to
 * format the frozen color value written into the immutable audit (ADR 0018) so a
 * history line shows "Blue", never the raw id. Falls back to the id when unknown
 * so a caller never gets an empty string.
 */
export function colorLabel(id: string): string {
  if (isPersonalCircleColorId(id)) {
    return "Iris";
  }
  return COLOR_NAMES.get(id) ?? id;
}

/**
 * The hex for a palette color id ("blue" → "#3b82f6"). The presentational
 * counterpart to {@link colorLabel}: it backs the Circle Mark / Category swatch
 * tint from the stored color id without a UI re-deriving the palette lookup.
 * Falls back to the default color's hex for an unknown id so a caller never gets
 * an empty string or a broken style.
 */
export function colorHex(id: string): string {
  if (isPersonalCircleColorId(id)) {
    return PERSONAL_CIRCLE_COLOR_HEX;
  }
  return COLOR_HEXES.get(id) ?? COLOR_HEXES.get(DEFAULT_COLOR_ID) ?? COLOR_PALETTE[0].hex;
}

/**
 * A deterministic palette color for a stable seed (e.g. a Display Name) — the
 * background tint of a generated initials avatar when no Profile Picture is
 * available. The same seed always maps to the same color across renders and
 * sessions (never random, which would flicker). Seeding the avatar on the Display
 * Name — which the materialized identity mirrors onto all of a User's active
 * memberships (ADR 0018) — keeps the generated chip consistent for the same
 * person across every Circle without the client needing the raw userId. Colors
 * are a visual cue, not identity: collisions between seeds are fine
 * (PRD stories 11, 60).
 */
export function paletteColorForSeed(seed: string): PaletteColor {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index] ?? COLOR_PALETTE[0];
}

/** A random palette color id — for forms where the user can change the pick before submit. */
export function randomColorId(): ColorId {
  const index = Math.floor(Math.random() * COLOR_PALETTE.length);
  return (COLOR_PALETTE[index] ?? COLOR_PALETTE[0]).id;
}
