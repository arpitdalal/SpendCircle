import { z } from "zod";
import type { CategoryInput } from "./validation.js";

export const CIRCLE_PURPOSES = [
  "residence",
  "trip",
  "family",
  "roommates",
  "project",
  "personal",
  "other",
] as const;

export const RESIDENCE_TYPES = ["leased", "owned"] as const;

export const circleSetupAnswersSchema = z.object({
  purpose: z.enum(CIRCLE_PURPOSES).optional(),
  residenceType: z.enum(RESIDENCE_TYPES).optional(),
});

export type CircleSetupAnswers = z.infer<typeof circleSetupAnswersSchema>;

const SHARED_STARTERS = [
  { name: "Groceries", type: "expense", color: "green" },
  { name: "Dining", type: "expense", color: "rose" },
  { name: "Transport", type: "expense", color: "sky" },
  { name: "Utilities", type: "expense", color: "amber" },
  { name: "Health", type: "expense", color: "red" },
  { name: "Entertainment", type: "expense", color: "violet" },
  { name: "Shopping", type: "expense", color: "pink" },
  { name: "Education", type: "expense", color: "indigo" },
  { name: "Travel", type: "expense", color: "teal" },
] as const satisfies readonly CategoryInput[];

const RESIDENCE_STARTERS = {
  leased: { name: "Rent", type: "expense", color: "orange" },
  owned: { name: "Mortgage", type: "expense", color: "slate" },
} as const satisfies Record<NonNullable<CircleSetupAnswers["residenceType"]>, CategoryInput>;

export function starterCategories(answers: CircleSetupAnswers) {
  const starters: CategoryInput[] = [...SHARED_STARTERS];
  if (answers.purpose === "residence" && answers.residenceType) {
    starters.push(RESIDENCE_STARTERS[answers.residenceType]);
  }
  return starters;
}
