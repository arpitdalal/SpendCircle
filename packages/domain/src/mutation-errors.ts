import { z } from "zod";

function defineMutationError<const Code extends string>(code: Code, message: string) {
  return Object.freeze({ code, message });
}

function defineMutationErrorCatalog<
  const T extends Record<string, { readonly code: string; readonly message: string }>,
>(catalog: T) {
  const errors = Object.freeze(catalog);
  const codes = Object.values(errors).map((error) => error.code);
  if (codes.length === 0) {
    throw new Error("Mutation error catalog must define at least one error");
  }
  const [firstCode, ...restCodes] = codes;
  if (firstCode === undefined) {
    throw new Error("Mutation error catalog must define at least one error");
  }
  const dataSchema = z.object({
    code: z.enum([firstCode, ...restCodes]),
  });

  type Code = T[keyof T]["code"];

  return {
    errors,
    dataSchema: dataSchema satisfies z.ZodType<{ code: Code }>,
    errorData(error: { code: Code }) {
      return { code: error.code };
    },
    messageForCode(code: string) {
      return Object.values(errors).find((entry) => entry.code === code)?.message ?? null;
    },
  };
}

const mutationErrors = defineMutationErrorCatalog({
  circleArchived: defineMutationError("circle.archived", "Circle is archived"),
  categoryNameDuplicate: defineMutationError(
    "category.nameDuplicate",
    "A category with this name already exists for this type",
  ),
  inviteForbidden: defineMutationError(
    "invite.forbidden",
    "Only the Circle owner can invite members",
  ),
  inviteSetupIncomplete: defineMutationError(
    "invite.setupIncomplete",
    "Finish setting up this Circle before inviting members",
  ),
  invitePersonalCircle: defineMutationError(
    "invite.personalCircle",
    "Personal Circles can't have other members",
  ),
  inviteAlreadyMember: defineMutationError(
    "invite.alreadyMember",
    "That person is already a member of this Circle",
  ),
  inviteAlreadyPending: defineMutationError(
    "invite.alreadyPending",
    "There's already a pending invitation for that email",
  ),
  inviteResendCapReached: defineMutationError(
    "invite.resendCapReached",
    "This invitation has been resent too many times today. Try again tomorrow.",
  ),
  inviteDailyCapReached: defineMutationError(
    "invite.dailyCapReached",
    "You've sent too many invitation emails today. Try again tomorrow.",
  ),
  leavePersonalCircle: defineMutationError(
    "leave.personalCircle",
    "You can't leave your Personal Circle",
  ),
  ownerMustTransfer: defineMutationError(
    "member.ownerMustTransfer",
    "Transfer ownership before leaving",
  ),
});

export const MUTATION_ERRORS = mutationErrors.errors;
export const mutationErrorDataSchema = mutationErrors.dataSchema;
export const mutationErrorData = mutationErrors.errorData;
export const mutationErrorMessageForCode = mutationErrors.messageForCode;

export type MutationErrorCode = (typeof MUTATION_ERRORS)[keyof typeof MUTATION_ERRORS]["code"];

type MutationErrorCodeIsLiteralUnion = MutationErrorCode extends string
  ? string extends MutationErrorCode
    ? never
    : true
  : never;

const _mutationErrorCodeIsLiteralUnion: MutationErrorCodeIsLiteralUnion = true;
