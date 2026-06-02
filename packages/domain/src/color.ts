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

export function isValidColorId(id: string): id is ColorId {
  return COLOR_IDS.has(id);
}

/**
 * The human-readable name for a palette color id ("blue" → "Blue"). Used to
 * format the frozen color value written into the immutable audit (ADR 0018) so a
 * history line shows "Blue", never the raw id. Falls back to the id when unknown
 * so a caller never gets an empty string.
 */
export function colorLabel(id: string): string {
  return COLOR_NAMES.get(id) ?? id;
}

export const DEFAULT_COLOR_ID: ColorId = "blue";
