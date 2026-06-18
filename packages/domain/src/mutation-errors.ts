import { z } from "zod";

function defineMutationError<const Code extends string>(code: Code, message: string) {
  return Object.freeze({ code, message });
}

export const MUTATION_ERRORS = Object.freeze({
  circleArchived: defineMutationError("circle.archived", "Circle is archived"),
  categoryNameDuplicate: defineMutationError(
    "category.nameDuplicate",
    "A category with this name already exists for this type",
  ),
});

export const mutationErrorDataSchema = z.object({
  code: z.enum([MUTATION_ERRORS.circleArchived.code, MUTATION_ERRORS.categoryNameDuplicate.code]),
});

export function mutationErrorData(error: { code: string }) {
  return { code: error.code };
}

export function mutationErrorMessageForCode(code: string) {
  return Object.values(MUTATION_ERRORS).find((error) => error.code === code)?.message ?? null;
}
