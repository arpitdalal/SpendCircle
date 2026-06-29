import { api } from "@spend-circle/convex";
import { useMutation } from "convex/react";

export function useSubmitFeedback() {
  return useMutation(api.feedback.submitFeedback);
}
